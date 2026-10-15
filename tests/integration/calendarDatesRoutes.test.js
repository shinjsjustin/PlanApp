'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const calendarNotesRepo = require('../../src/db/repositories/calendarNotesRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { addDays, localToday } = require('../../src/lib/localDate');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const ZONE = 'Pacific/Auckland';
const today = () => localToday(ZONE);

const insertDay = async (conn, ownerId, position, date) => {
    const [result] = await conn.execute(
        'INSERT INTO calendar_days (owner_id, position, date) VALUES (?, ?, ?)',
        [ownerId, position, date]
    );
    return result.insertId;
};

const call = (method, path, ownerId) =>
    request(app)
        [method](path)
        .set('Authorization', authHeaderFor(ownerId))
        .set('X-Time-Zone', ZONE);

describe('GET /api/calendar dating', () => {
    test('dates dateless days from today in position order', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await calendarDaysRepo.create(conn, { ownerId });
        await calendarDaysRepo.create(conn, { ownerId });

        const response = await call('get', '/api/calendar', ownerId);

        expect(response.status).toBe(200);
        expect(response.body.data.days.map((day) => day.date)).toEqual([
            today(),
            addDays(today(), 1),
        ]);
    });

    test('continues after the last dated day and keeps existing dates', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await insertDay(conn, ownerId, 0, '2030-05-01');
        await insertDay(conn, ownerId, 1, null);

        const response = await call('get', '/api/calendar', ownerId);

        expect(response.body.data.days.map((day) => day.date)).toEqual(['2030-05-01', '2030-05-02']);
    });
});

describe('appending days', () => {
    test('POST /days on an empty strip is dated today, then last date + 1', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const first = await call('post', '/api/calendar/days', ownerId);
        const second = await call('post', '/api/calendar/days', ownerId);

        expect(first.status).toBe(201);
        expect(first.body.data.date).toBe(today());
        expect(second.body.data.date).toBe(addDays(today(), 1));
    });

    test('appendDays in PUT /items dates new days the same way', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'a' });
        const other = await todosRepo.create(conn, { projectId: project.id, text: 'b' });
        await insertDay(conn, ownerId, 0, '2030-05-01');

        const response = await call('put', '/api/calendar/items', ownerId).send({
            appendDays: 2,
            placements: [
                { todoId: todo.id, dayIndex: 1, startMinutes: 60, durationMinutes: 30 },
                { todoId: other.id, dayIndex: 2, startMinutes: 60, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(200);
        expect(response.body.data.days.map((day) => day.date)).toEqual([
            '2030-05-01',
            '2030-05-02',
            '2030-05-03',
        ]);
    });
});

describe('POST /api/calendar/days/clear-past', () => {
    test('deletes past days with bookings and notes, keeps the rest, answers the calendar', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'a' });
        const pastId = await insertDay(conn, ownerId, 0, addDays(today(), -1));
        const todayId = await insertDay(conn, ownerId, 1, today());
        await calendarItemsRepo.upsert(conn, {
            dayId: pastId,
            todoId: todo.id,
            startMinutes: 60,
            durationMinutes: 30,
        });
        await calendarNotesRepo.create(conn, {
            dayId: pastId,
            text: 'old',
            startMinutes: 0,
            durationMinutes: 30,
        });

        const response = await call('post', '/api/calendar/days/clear-past', ownerId).send({});

        expect(response.status).toBe(200);
        expect(response.body.data.days.map((day) => [day.id, day.position])).toEqual([[todayId, 0]]);
        expect(response.body.data.items).toEqual([]);
        expect(await calendarNotesRepo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
    });

    test('leaves other users days alone', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await insertDay(conn, otherId, 0, '2000-01-01');

        const response = await call('post', '/api/calendar/days/clear-past', ownerId).send({});

        expect(response.status).toBe(200);
        expect(await calendarDaysRepo.listByOwner(conn, otherId)).toHaveLength(1);
    });

    test('answers 200 unchanged when no day is past', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const id = await insertDay(conn, ownerId, 0, today());

        const response = await call('post', '/api/calendar/days/clear-past', ownerId).send({});

        expect(response.status).toBe(200);
        expect(response.body.data.days.map((day) => day.id)).toEqual([id]);
    });
});
