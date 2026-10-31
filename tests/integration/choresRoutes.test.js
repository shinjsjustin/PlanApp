'use strict';

const request = require('supertest');

const app = require('../../src/server');
const choresRepo = require('../../src/db/repositories/choresRepo');
const logsRepo = require('../../src/db/repositories/choreLogsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const mk = (conn, ownerId, name, windowMin = 3, windowMax = 7) =>
    choresRepo.create(conn, { ownerId, name, windowMin, windowMax });

describe('GET /api/chores', () => {
    test('lists the caller’s active chores most urgent first, using the header’s today', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const never = await mk(conn, ownerId, 'Never');
        const overdue = await mk(conn, ownerId, 'Overdue');
        const upcoming = await mk(conn, ownerId, 'Upcoming');
        const archived = await mk(conn, ownerId, 'Archived');
        await mk(conn, otherId, 'Theirs');
        await logsRepo.create(conn, { choreId: overdue.id, doneOn: '2026-01-01', doneBy: 'A' });
        await logsRepo.create(conn, { choreId: upcoming.id, doneOn: '2026-01-10', doneBy: 'A' });
        await choresRepo.setArchived(conn, archived.id, true);

        const response = await request(app)
            .get('/api/chores')
            .set(as(ownerId))
            .set('X-Time-Zone', 'Pacific/Kiritimati');

        expect(response.status).toBe(200);
        const { chores } = response.body.data;
        expect(chores.map((c) => c.id)).toEqual([overdue.id, upcoming.id, never.id]);
        expect(chores.map((c) => c.status)).toEqual(['overdue', 'overdue', 'never']);
    });

    test('due status follows the X-Time-Zone date', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId, 'Tz', 1, 1);
        // Two zones 24h apart on the calendar: Kiritimati is UTC+14, Pago_Pago UTC-11.
        const fmt = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
        const early = fmt('Pacific/Pago_Pago');
        await logsRepo.create(conn, { choreId: chore.id, doneOn: early, doneBy: 'A' });

        const west = await request(app).get(`/api/chores/${chore.id}`).set(as(ownerId)).set('X-Time-Zone', 'Pacific/Pago_Pago');
        const east = await request(app).get(`/api/chores/${chore.id}`).set(as(ownerId)).set('X-Time-Zone', 'Pacific/Kiritimati');

        expect(west.body.data.daysSince).toBe(0);
        // 25 hours apart, so Kiritimati is always at least one calendar day ahead.
        expect(east.body.data.daysSince).toBeGreaterThanOrEqual(1);
    });

    test('?archived=true lists only archived chores by name; bad value is 400', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'Active');
        const zed = await mk(conn, ownerId, 'Zed');
        const abe = await mk(conn, ownerId, 'Abe');
        await choresRepo.setArchived(conn, zed.id, true);
        await choresRepo.setArchived(conn, abe.id, true);

        const response = await request(app).get('/api/chores?archived=true').set(as(ownerId));
        const bad = await request(app).get('/api/chores?archived=maybe').set(as(ownerId));

        expect(response.body.data.chores.map((c) => c.name)).toEqual(['Abe', 'Zed']);
        expect(bad.status).toBe(400);
    });
});

describe('POST /api/chores', () => {
    test('creates a chore, trimming text and defaulting max to min', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app)
            .post('/api/chores')
            .set(as(ownerId))
            .send({ name: '  Vacuum ', area: ' Hall ', window: { min: 4 }, notes: '' });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            name: 'Vacuum', area: 'Hall', window: { min: 4, max: 4 }, notes: null,
            archived: false, status: 'never',
        });
    });

    test.each([
        ['blank name', { name: '   ', window: { min: 1 } }],
        ['missing name', { window: { min: 1 } }],
        ['missing window', { name: 'X' }],
        ['min zero', { name: 'X', window: { min: 0 } }],
        ['max below min', { name: 'X', window: { min: 5, max: 4 } }],
        ['max above 365', { name: 'X', window: { min: 1, max: 366 } }],
        ['fractional min', { name: 'X', window: { min: 1.5 } }],
        ['name too long', { name: 'x'.repeat(101), window: { min: 1 } }],
        ['area too long', { name: 'X', area: 'x'.repeat(51), window: { min: 1 } }],
        ['notes too long', { name: 'X', notes: 'x'.repeat(2001), window: { min: 1 } }],
    ])('rejects %s with 400', async (_label, body) => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app).post('/api/chores').set(as(ownerId)).send(body);

        expect(response.status).toBe(400);
    });

    test('a duplicate name is 409, also against archived chores, but not for another user', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const old = await mk(conn, ownerId, 'Dup');
        await choresRepo.setArchived(conn, old.id, true);

        const dup = await request(app).post('/api/chores').set(as(ownerId)).send({ name: 'Dup', window: { min: 1 } });
        const elsewhere = await request(app).post('/api/chores').set(as(otherId)).send({ name: 'Dup', window: { min: 1 } });

        expect(dup.status).toBe(409);
        expect(elsewhere.status).toBe(201);
    });
});

describe('GET and PATCH /api/chores/:id', () => {
    test('reads a chore and edits fields, clearing area and notes with blank or null', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await choresRepo.create(conn, {
            ownerId, name: 'Old', area: 'Hall', windowMin: 3, windowMax: 7, notes: 'n',
        });

        const read = await request(app).get(`/api/chores/${chore.id}`).set(as(ownerId));
        const patch = await request(app)
            .patch(`/api/chores/${chore.id}`)
            .set(as(ownerId))
            .send({ name: ' New ', area: '  ', notes: null, window: { min: 2, max: 9 } });

        expect(read.status).toBe(200);
        expect(read.body.data).toMatchObject({ id: chore.id, name: 'Old', area: 'Hall', notes: 'n' });
        expect(patch.status).toBe(200);
        expect(patch.body.data).toMatchObject({
            name: 'New', area: null, notes: null, window: { min: 2, max: 9 },
        });
    });

    test('rejects an empty patch and a bad window with 400, a clashing name with 409', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'Taken');
        const chore = await mk(conn, ownerId, 'Mine');

        const empty = await request(app).patch(`/api/chores/${chore.id}`).set(as(ownerId)).send({});
        const bad = await request(app).patch(`/api/chores/${chore.id}`).set(as(ownerId)).send({ window: { min: 9, max: 2 } });
        const clash = await request(app).patch(`/api/chores/${chore.id}`).set(as(ownerId)).send({ name: 'Taken' });

        expect([empty.status, bad.status, clash.status]).toEqual([400, 400, 409]);
    });

    test('an unknown id is 404 and a malformed id is 400', async () => {
        const ownerId = await createTestUser(getConn());

        const missing = await request(app).get('/api/chores/999999999').set(as(ownerId));
        const malformed = await request(app).get('/api/chores/abc').set(as(ownerId));

        expect(missing.status).toBe(404);
        expect(malformed.status).toBe(400);
    });
});

describe('POST /api/chores/:id/archive and /restore', () => {
    test('archive then restore toggles archived', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId, 'Toggle');

        const archived = await request(app).post(`/api/chores/${chore.id}/archive`).set(as(ownerId));
        const restored = await request(app).post(`/api/chores/${chore.id}/restore`).set(as(ownerId));

        expect(archived.status).toBe(200);
        expect(archived.body.data).toMatchObject({ id: chore.id, archived: true });
        expect(archived.body.data.archivedAt).not.toBeNull();
        expect(restored.body.data).toMatchObject({ archived: false, archivedAt: null });
    });
});

describe('ownership', () => {
    test("another user's chore answers 403 on every id route and changes nothing", async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId, 'Mine');
        const url = `/api/chores/${chore.id}`;

        // Sequential: the test shares one transaction connection.
        const responses = [];
        responses.push(await request(app).get(url).set(as(strangerId)));
        responses.push(await request(app).patch(url).set(as(strangerId)).send({ name: 'Hacked' }));
        responses.push(await request(app).post(`${url}/archive`).set(as(strangerId)));
        responses.push(await request(app).post(`${url}/restore`).set(as(strangerId)));

        expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403]);
        expect(await choresRepo.findById(conn, chore.id)).toMatchObject({ name: 'Mine', archived_at: null });
    });

    test('requires authentication', async () => {
        const response = await request(app).get('/api/chores');

        expect(response.status).toBe(401);
    });
});
