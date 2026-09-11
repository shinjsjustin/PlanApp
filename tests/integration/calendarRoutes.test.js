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

describe('PUT /api/calendar/items', () => {
    test('books to-dos into an existing day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                placements: [
                    { todoId: todos[0].id, dayId: days[0].id, startMinutes: 540, durationMinutes: 60 },
                    { todoId: todos[1].id, dayId: days[0].id, startMinutes: 600, durationMinutes: 30 },
                ],
            });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(2);
        expect(response.body.data.items.map((item) => item.startMinutes)).toEqual([540, 600]);
    });

    test('creates the days a spill needed and resolves dayIndex against them', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn, { dayCount: 1 });

        // Act — one item stays in day 0, one lands in the day this call creates
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                appendDays: 1,
                placements: [
                    { todoId: todos[0].id, dayId: days[0].id, startMinutes: 1380, durationMinutes: 60 },
                    { todoId: todos[1].id, dayIndex: 1, startMinutes: 0, durationMinutes: 60 },
                ],
            });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.days).toHaveLength(2);

        const created = response.body.data.days[1];
        const spilled = response.body.data.items.find((item) => item.todoId === todos[1].id);
        expect(spilled.dayId).toBe(created.id);
        expect(spilled.startMinutes).toBe(0);
    });

    test('moves an existing booking rather than duplicating it', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                placements: [
                    { todoId: todos[0].id, dayId: days[1].id, startMinutes: 0, durationMinutes: 30 },
                ],
            });

        // Assert
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0]).toMatchObject({
            dayId: days[1].id,
            startMinutes: 0,
            durationMinutes: 30,
        });
    });

    test('unschedules in the same call that places', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                unschedule: [todos[0].id],
                placements: [
                    { todoId: todos[1].id, dayId: days[0].id, startMinutes: 0, durationMinutes: 60 },
                ],
            });

        // Assert
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0].todoId).toBe(todos[1].id);
    });

    test('accepts an empty request as a no-op', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId } = await createWorld(conn);

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });
});

describe('PUT /api/calendar/items — refusals', () => {
    /** Sends one bulk body and returns the response. */
    const put = (ownerId, body) =>
        request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body);

    test('refuses a to-do that is both unscheduled and placed', async () => {
        // The delete runs before the upserts, so this would otherwise resolve
        // quietly in favour of the placement — an order of instructions rather
        // than an answer to a request that asks for two contradictory things.
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        const response = await put(ownerId, {
            unschedule: [todos[0].id],
            placements: [
                { todoId: todos[0].id, dayId: days[1].id, startMinutes: 540, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/both unscheduled and placed/);

        // Refused means nothing moved.
        const [item] = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(item).toMatchObject({ day_id: days[0].id, start_minutes: 0 });
    });

    test('refuses a start off the 30-minute grid', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 545, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/multiple of 30/);
    });

    test('refuses a duration below one slot', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 0, durationMinutes: 0 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/at least 30/);
    });

    test('refuses a booking running past the end of its day', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 1410, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/past the end of its day/);
    });

    test('refuses two placements that overlap', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 540, durationMinutes: 60 },
                { todoId: todos[1].id, dayId: days[0].id, startMinutes: 570, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/overlap/);
    });

    test('refuses a placement landing on a booking the request never mentioned', async () => {
        // Arrange — the payload alone looks legal; only the stored day is wrong
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[2].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 570, durationMinutes: 30 },
            ],
        });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/overlap/);
        const stored = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(stored.map((item) => item.todo_id)).toEqual([todos[2].id]);
    });

    test('refuses a placement naming both dayId and dayIndex', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                {
                    todoId: todos[0].id,
                    dayId: days[0].id,
                    dayIndex: 0,
                    startMinutes: 0,
                    durationMinutes: 30,
                },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/exactly one of dayId or dayIndex/);
    });

    test('refuses more appended days than there are placements', async () => {
        const conn = getConn();
        const { ownerId } = await createWorld(conn);

        const response = await put(ownerId, { appendDays: 3, placements: [] });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/appendDays may not exceed/);
    });

    test('refuses a dayIndex beyond the end of the calendar', async () => {
        const conn = getConn();
        const { ownerId, todos } = await createWorld(conn, { dayCount: 1 });

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayIndex: 9, startMinutes: 0, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/beyond the end of the calendar/);
    });

    test('refuses the same to-do placed twice', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 0, durationMinutes: 30 },
                { todoId: todos[0].id, dayId: days[1].id, startMinutes: 0, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/more than one placement/);
    });

    test('forbids booking someone else’s to-do', async () => {
        const conn = getConn();
        const mine = await createWorld(conn);
        const theirs = await createWorld(conn);

        const response = await put(mine.ownerId, {
            placements: [
                {
                    todoId: theirs.todos[0].id,
                    dayId: mine.days[0].id,
                    startMinutes: 0,
                    durationMinutes: 30,
                },
            ],
        });

        expect(response.status).toBe(403);
    });

    test('forbids booking into someone else’s day', async () => {
        const conn = getConn();
        const mine = await createWorld(conn);
        const theirs = await createWorld(conn);

        const response = await put(mine.ownerId, {
            placements: [
                {
                    todoId: mine.todos[0].id,
                    dayId: theirs.days[0].id,
                    startMinutes: 0,
                    durationMinutes: 30,
                },
            ],
        });

        expect(response.status).toBe(403);
    });

    test('leaves no day behind when the call is rejected', async () => {
        // Arrange — this is the atomicity guarantee the whole endpoint exists for
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn, { dayCount: 1 });

        // Act — the append is legal, the placement is not
        const response = await put(ownerId, {
            appendDays: 1,
            placements: [
                { todoId: todos[0].id, dayIndex: 1, startMinutes: 545, durationMinutes: 60 },
            ],
        });

        // Assert
        expect(response.status).toBe(400);
        const remaining = await calendarDaysRepo.listByOwner(conn, ownerId);
        expect(remaining.map((day) => day.id)).toEqual([days[0].id]);
    });
});

describe('DELETE /api/calendar/items/:todoId', () => {
    test('unschedules the booking and leaves the to-do', async () => {
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
        const response = await request(app)
            .delete(`/api/calendar/items/${todos[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ todoId: todos[0].id });
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await todosRepo.findById(conn, todos[0].id)).not.toBeNull();
    });

    test('reports 404 when the to-do is not booked', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos } = await createWorld(conn);

        // Act
        const response = await request(app)
            .delete(`/api/calendar/items/${todos[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });

    test('forbids unscheduling someone else’s booking', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: theirs.days[0].id,
            todoId: theirs.todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/items/${theirs.todos[0].id}`)
            .set('Authorization', authHeaderFor(mine));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarItemsRepo.listByOwner(conn, theirs.ownerId)).toHaveLength(1);
    });
});
