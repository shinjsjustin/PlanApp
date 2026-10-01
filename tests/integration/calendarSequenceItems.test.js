'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

/** An owner with a pinned sequence, a to-do, and one day. */
const createWorld = async (conn) => {
    const fixture = await createFixture(conn);
    await sequencesRepo.setPinned(conn, [fixture.sequence.id], true);
    const todo = await todosRepo.create(conn, { projectId: fixture.project.id, text: 'Solo' });
    const day = await calendarDaysRepo.create(conn, { ownerId: fixture.ownerId });

    return { ...fixture, todo, day };
};

const put = (ownerId, body) =>
    request(app).put('/api/calendar/items').set('Authorization', authHeaderFor(ownerId)).send(body);

const getCalendar = (ownerId) =>
    request(app).get('/api/calendar').set('Authorization', authHeaderFor(ownerId));

/** Bookings in the days of the given owners; the test database may hold other rows. */
const countItems = async (conn, ...ownerIds) => {
    const [[row]] = await conn.query(
        `SELECT COUNT(*) AS n FROM calendar_items ci
         JOIN calendar_days d ON d.id = ci.day_id
         WHERE d.owner_id IN (?)`,
        [ownerIds]
    );

    return row.n;
};

describe('booking a pinned sequence', () => {
    test('PUT then GET returns a sequence item', async () => {
        const conn = getConn();
        const { ownerId, project, sequence, day } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { sequenceId: sequence.id, dayId: day.id, startMinutes: 540, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(200);
        const { items } = (await getCalendar(ownerId)).body.data;
        expect(items).toEqual([
            {
                id: expect.any(Number),
                dayId: day.id,
                kind: 'sequence',
                todoId: null,
                sequenceId: sequence.id,
                text: 'Learn aerodynamics',
                status: null,
                isPinned: true,
                projectId: project.id,
                projectTitle: 'Build a drone',
                sequenceTitle: 'Learn aerodynamics',
                startMinutes: 540,
                durationMinutes: 60,
            },
        ]);
    });

    test('moves an existing sequence booking rather than adding a second', async () => {
        const conn = getConn();
        const { ownerId, sequence, day } = await createWorld(conn);
        const place = (startMinutes) =>
            put(ownerId, {
                placements: [
                    { sequenceId: sequence.id, dayId: day.id, startMinutes, durationMinutes: 60 },
                ],
            });
        await place(540);

        const response = await place(600);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0].startMinutes).toBe(600);
    });

    test('a to-do and a sequence can be placed in one request', async () => {
        const conn = getConn();
        const { ownerId, sequence, todo, day } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todo.id, dayId: day.id, startMinutes: 540, durationMinutes: 60 },
                { sequenceId: sequence.id, dayId: day.id, startMinutes: 600, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(200);
        expect(response.body.data.items.map((item) => item.todoId)).toEqual([todo.id, null]);
    });

    test.each([
        ['both ids', (s, t) => ({ sequenceId: s, todoId: t })],
        ['neither id', () => ({})],
    ])('a placement with %s is 400 and writes nothing', async (name, ids) => {
        const conn = getConn();
        const { ownerId, sequence, todo, day } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { ...ids(sequence.id, todo.id), dayId: day.id, startMinutes: 540, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(await countItems(conn, ownerId)).toBe(0);
    });

    test('refuses an unpinned sequence and writes nothing', async () => {
        const conn = getConn();
        const { ownerId, sequence, day } = await createWorld(conn);
        await sequencesRepo.setPinned(conn, [sequence.id], false);

        const response = await put(ownerId, {
            placements: [
                { sequenceId: sequence.id, dayId: day.id, startMinutes: 540, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(await countItems(conn, ownerId)).toBe(0);
    });

    test("refuses another user's sequence with 403 and writes nothing", async () => {
        const conn = getConn();
        const owner = await createWorld(conn);
        const { sequence } = owner;
        const other = await createWorld(conn);

        const response = await put(other.ownerId, {
            placements: [
                {
                    sequenceId: sequence.id,
                    dayId: other.day.id,
                    startMinutes: 540,
                    durationMinutes: 60,
                },
            ],
        });

        expect(response.status).toBe(403);
        expect(await countItems(conn, owner.ownerId, other.ownerId)).toBe(0);
    });

    test('a missing sequence is 404', async () => {
        const conn = getConn();
        const { ownerId, day } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { sequenceId: 99999999, dayId: day.id, startMinutes: 540, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(404);
    });

    test('a sequence overlapping a stored to-do booking is 400 and rolls back', async () => {
        const conn = getConn();
        const { ownerId, sequence, todo, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todo.id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        const response = await put(ownerId, {
            placements: [
                { sequenceId: sequence.id, dayId: day.id, startMinutes: 570, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(await countItems(conn, ownerId)).toBe(1);
    });
});

describe('releasing a sequence booking', () => {
    const book = async (conn) => {
        const world = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: world.day.id,
            sequenceId: world.sequence.id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        return world;
    };

    test('unscheduleSequences in the bulk body releases it', async () => {
        const conn = getConn();
        const { ownerId, sequence } = await book(conn);

        const response = await put(ownerId, { unscheduleSequences: [sequence.id] });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    test('a sequence unpinned after booking can still be released', async () => {
        const conn = getConn();
        const { ownerId, sequence } = await book(conn);
        await sequencesRepo.setPinned(conn, [sequence.id], false);

        const response = await put(ownerId, { unscheduleSequences: [sequence.id] });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    test('a sequence both unscheduled and placed is 400', async () => {
        const conn = getConn();
        const { ownerId, sequence, day } = await book(conn);

        const response = await put(ownerId, {
            unscheduleSequences: [sequence.id],
            placements: [
                { sequenceId: sequence.id, dayId: day.id, startMinutes: 0, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(400);
        expect(await countItems(conn, ownerId)).toBe(1);
    });

    test('DELETE /items/sequences/:sequenceId releases it', async () => {
        const conn = getConn();
        const { ownerId, sequence } = await book(conn);

        const response = await request(app)
            .delete(`/api/calendar/items/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        expect(response.status).toBe(200);
        expect(await countItems(conn, ownerId)).toBe(0);
    });

    test('DELETE answers 404 when the sequence has no booking', async () => {
        const conn = getConn();
        const { ownerId, sequence } = await createWorld(conn);

        const response = await request(app)
            .delete(`/api/calendar/items/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        expect(response.status).toBe(404);
    });

    test("DELETE refuses another user's sequence and keeps the booking", async () => {
        const conn = getConn();
        const owner = await book(conn);
        const { sequence } = owner;
        const other = await createWorld(conn);

        const response = await request(app)
            .delete(`/api/calendar/items/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(other.ownerId));

        expect(response.status).toBe(403);
        expect(await countItems(conn, owner.ownerId)).toBe(1);
    });

    test('deleting the sequence removes its booking', async () => {
        const conn = getConn();
        const { ownerId, sequence } = await book(conn);

        await sequencesRepo.remove(conn, sequence.id);

        expect((await getCalendar(ownerId)).body.data.items).toEqual([]);
    });

    test('removeBySequenceIds returns how many were released and ignores duplicates', async () => {
        const conn = getConn();
        const { sequence } = await book(conn);

        expect(await calendarItemsRepo.removeBySequenceIds(conn, [sequence.id, sequence.id])).toBe(1);
        expect(await calendarItemsRepo.removeBySequenceIds(conn, [])).toBe(0);
    });
});
