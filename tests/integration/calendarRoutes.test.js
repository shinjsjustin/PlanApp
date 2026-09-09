'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * The calendar half of design section 5. Every request runs on the connection
 * the test opened, so everything the routes write is rolled back afterwards
 * (tests/helpers/db.js).
 *
 * Two properties are asserted over and over: nothing crosses an ownership
 * boundary, and the bulk endpoint is all-or-nothing — a rejected call must leave
 * no day and no booking behind.
 */

/** An owner with a project, a sequence, `todoCount` to-dos, and `dayCount` days. */
const createWorld = async (conn, { todoCount = 3, dayCount = 2 } = {}) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Auth rewrite' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Groundwork' });
    const sequence = await sequencesRepo.create(conn, {
        layerId: layer.id,
        title: 'Session handling',
    });

    const todos = [];
    for (let index = 0; index < todoCount; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        todos.push(
            await todosRepo.create(conn, {
                projectId: project.id,
                text: `Step ${index}`,
                sequenceId: sequence.id,
            })
        );
    }

    const days = [];
    for (let index = 0; index < dayCount; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        days.push(await calendarDaysRepo.create(conn, { ownerId }));
    }

    return { ownerId, project, sequence, todos, days };
};

describe('GET /api/calendar', () => {
    test('returns an empty calendar for a new user', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ days: [], items: [] });
    });

    test('returns days left to right with their bookings', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[1].id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.body.data.days.map((day) => day.position)).toEqual([0, 1]);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0]).toMatchObject({
            dayId: days[1].id,
            todoId: todos[0].id,
            text: 'Step 0',
            projectTitle: 'Auth rewrite',
            sequenceTitle: 'Session handling',
            startMinutes: 540,
            durationMinutes: 60,
        });
    });

    test('never leaks owner_id', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId } = await createWorld(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(JSON.stringify(response.body)).not.toContain('owner');
    });

    test('shows nothing of another owner’s calendar', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        await createWorld(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(mine));

        // Assert
        expect(response.body.data).toEqual({ days: [], items: [] });
    });

    test('refuses an unauthenticated request', async () => {
        // Act
        const response = await request(app).get('/api/calendar');

        // Assert
        expect(response.status).toBe(401);
    });
});

describe('POST /api/calendar/days', () => {
    test('appends a day at the end and answers 201', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId } = await createWorld(conn, { dayCount: 2 });

        // Act
        const response = await request(app)
            .post('/api/calendar/days')
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data.position).toBe(2);
        expect(response.body.data).not.toHaveProperty('ownerId');
    });

    test('appends to the caller’s own strip, not to anyone else’s', async () => {
        // Arrange — the one route with no cross-boundary assertion of its own,
        // and the one the bulk endpoint's `appendDays` will reuse.
        const conn = getConn();
        const theirs = await createWorld(conn, { dayCount: 1 });
        const { ownerId } = await createWorld(conn, { dayCount: 1 });

        // Act
        const response = await request(app)
            .post('/api/calendar/days')
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.body.data.position).toBe(1);
        expect(await calendarDaysRepo.listByOwner(conn, ownerId)).toHaveLength(2);
        expect(await calendarDaysRepo.listByOwner(conn, theirs.ownerId)).toHaveLength(1);
    });
});

describe('DELETE /api/calendar/days/:id', () => {
    test('deletes the day, releases its bookings, and closes the gap', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn, { dayCount: 3 });
        await calendarItemsRepo.upsert(conn, {
            dayId: days[1].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/days/${days[1].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: days[1].id });

        const remaining = await calendarDaysRepo.listByOwner(conn, ownerId);
        expect(remaining.map((day) => [day.id, day.position])).toEqual([
            [days[0].id, 0],
            [days[2].id, 1],
        ]);
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
    });

    test('leaves the to-dos of a deleted day alone', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        await request(app)
            .delete(`/api/calendar/days/${days[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(await todosRepo.findById(conn, todos[0].id)).not.toBeNull();
    });

    test('forbids deleting someone else’s day', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createWorld(conn);

        // Act
        const response = await request(app)
            .delete(`/api/calendar/days/${theirs.days[0].id}`)
            .set('Authorization', authHeaderFor(mine));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarDaysRepo.findById(conn, theirs.days[0].id)).not.toBeNull();
    });

    test('reports 404 for a day that does not exist', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete('/api/calendar/days/999999')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });
});
