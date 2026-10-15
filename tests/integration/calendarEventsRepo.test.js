'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const daysRepo = require('../../src/db/repositories/calendarDaysRepo');
const repo = require('../../src/db/repositories/calendarEventsRepo');

const getConn = useTransaction();

const event = (googleEventId, overrides = {}) => ({
    googleEventId,
    title: `Event ${googleEventId}`,
    allDay: false,
    startMinutes: 600,
    durationMinutes: 30,
    ...overrides,
});

const setup = async (conn) => {
    const ownerId = await createTestUser(conn);
    const dayA = await daysRepo.create(conn, { ownerId, today: '2026-10-15' });
    const dayB = await daysRepo.create(conn, { ownerId, today: '2026-10-15' });

    return { ownerId, dayA, dayB };
};

describe('calendarEventsRepo', () => {
    it('replaceForDay leaves exactly the given rows and touches no other day', async () => {
        const conn = getConn();
        const { ownerId, dayA, dayB } = await setup(conn);

        await repo.replaceForDay(conn, dayA.id, [event('a1'), event('a2')]);
        await repo.replaceForDay(conn, dayB.id, [event('b1')]);
        await repo.replaceForDay(conn, dayA.id, [event('a3', { allDay: true, startMinutes: 0, durationMinutes: 1440 })]);

        const rows = await repo.listByOwner(conn, ownerId);
        expect(rows.map((r) => [r.day_id, r.google_event_id, r.title, r.all_day, r.start_minutes, r.duration_minutes])).toEqual([
            [dayA.id, 'a3', 'Event a3', 1, 0, 1440],
            [dayB.id, 'b1', 'Event b1', 0, 600, 30],
        ]);
    });

    it('replaceForDay with the same rows twice leaves no duplicates', async () => {
        const conn = getConn();
        const { ownerId, dayA } = await setup(conn);
        const rows = [event('a1'), event('a2')];

        await repo.replaceForDay(conn, dayA.id, rows);
        await repo.replaceForDay(conn, dayA.id, rows);

        expect(await repo.listByOwner(conn, ownerId)).toHaveLength(2);
    });

    it('replaceForDay with no rows clears the day', async () => {
        const conn = getConn();
        const { ownerId, dayA } = await setup(conn);

        await repo.replaceForDay(conn, dayA.id, [event('a1')]);
        await repo.replaceForDay(conn, dayA.id, []);

        expect(await repo.listByOwner(conn, ownerId)).toEqual([]);
    });

    it('listByOwner returns only that owner, ordered by day, all_day desc, start, id', async () => {
        const conn = getConn();
        const { ownerId, dayA, dayB } = await setup(conn);
        const other = await createTestUser(conn);
        const otherDay = await daysRepo.create(conn, { ownerId: other, today: '2026-10-15' });

        await repo.replaceForDay(conn, otherDay.id, [event('x1')]);
        await repo.replaceForDay(conn, dayB.id, [event('b1', { startMinutes: 60 })]);
        await repo.replaceForDay(conn, dayA.id, [
            event('a-late', { startMinutes: 900 }),
            event('a-early', { startMinutes: 100 }),
            event('a-tie1', { startMinutes: 100 }),
            event('a-allday', { allDay: true, startMinutes: 0, durationMinutes: 1440 }),
        ]);

        const rows = await repo.listByOwner(conn, ownerId);
        expect(rows.map((r) => r.google_event_id)).toEqual(['a-allday', 'a-early', 'a-tie1', 'a-late', 'b1']);
    });

    it('deleting a day cascades to its events', async () => {
        const conn = getConn();
        const { dayA } = await setup(conn);
        await repo.replaceForDay(conn, dayA.id, [event('a1')]);

        await daysRepo.remove(conn, dayA.id);

        const [rows] = await conn.execute('SELECT id FROM calendar_events WHERE day_id = ?', [dayA.id]);
        expect(rows).toEqual([]);
    });
});
