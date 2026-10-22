'use strict';

const request = require('supertest');

const app = require('../../src/server');
const remindersRepo = require('../../src/db/repositories/remindersRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const HOUR_MS = 60 * 60 * 1000;
const list = (userId, query = '') =>
    request(app).get(`/api/reminders${query}`).set({ Authorization: authHeaderFor(userId) });
const ids = (response) => response.body.data.reminders.map((r) => r.id);

const seed = async () => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const mk = async (fields, snoozedUntil) => {
        const row = await remindersRepo.create(conn, { ownerId, timeZone: 'UTC', title: 'r', ...fields });
        if (snoozedUntil) await remindersRepo.update(conn, row.id, { snoozedUntil });
        return row.id;
    };
    const future = new Date(Date.now() + 5 * HOUR_MS);
    const past = new Date(Date.now() - 5 * HOUR_MS);
    const r = {};
    r.plain = await mk({ dueDate: '2026-11-10' });
    r.snoozedFuture = await mk({ dueDate: '2026-11-15' }, future);
    r.snoozedPast = await mk({ dueDate: '2026-11-20' }, past);
    r.undated = await mk({});
    r.early = await mk({ dueDate: '2026-11-01' });
    r.done = await mk({ dueDate: '2026-11-12' });
    await remindersRepo.update(conn, r.done, { status: 'done' });
    return { ownerId, r };
};

describe('GET /api/reminders snoozed and range', () => {
    test('open hides reminders snoozed into the future; an expired snooze shows again', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId))).toEqual([r.early, r.plain, r.snoozedPast, r.undated]);
    });

    test('snoozed lists only reminders snoozed into the future', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?status=snoozed'))).toEqual([r.snoozedFuture]);
    });

    test('all still includes snoozed ones and history is unchanged', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?status=all'))).toHaveLength(6);
        expect(ids(await list(ownerId, '?status=history'))).toEqual([r.done]);
    });

    test('from and to are inclusive and drop reminders without a due date', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?status=all&from=2026-11-10&to=2026-11-15'))).toEqual([
            r.plain, r.done, r.snoozedFuture,
        ]);
    });

    test('either bound alone works and still drops undated', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?from=2026-11-10'))).toEqual([r.plain, r.snoozedPast]);
        expect(ids(await list(ownerId, '?to=2026-11-10'))).toEqual([r.early, r.plain]);
    });

    test('rejects from after to and malformed dates with 400', async () => {
        const { ownerId } = await seed();

        expect((await list(ownerId, '?from=2026-11-10&to=2026-11-09')).status).toBe(400);
        expect((await list(ownerId, '?from=nope')).status).toBe(400);
        expect((await list(ownerId, '?to=2026-13-40')).status).toBe(400);
    });

    test('every reminder response carries overdue', async () => {
        const { ownerId, r } = await seed();
        const ancient = await remindersRepo.create(getConn(), { ownerId, timeZone: 'UTC', title: 'old', dueDate: '2020-01-01' });

        const reminders = (await list(ownerId, '?status=all')).body.data.reminders;
        const byId = Object.fromEntries(reminders.map((x) => [x.id, x]));
        expect(byId[ancient.id].overdue).toBe(true);
        expect(byId[r.early].overdue).toBe(false);
        expect(byId[r.undated].overdue).toBe(false);
        expect(byId[r.done].overdue).toBe(false);
    });
});
