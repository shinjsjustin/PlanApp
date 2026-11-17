'use strict';

const request = require('supertest');

const app = require('../../src/server');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const anchor = (overrides = {}) => ({
    title: 'Wake',
    description: null,
    time: '06:30',
    days: 'daily',
    enabled: true,
    ...overrides,
});
const gate = (overrides = {}) => ({
    title: 'Plan the week',
    kind: 'plan',
    opensAt: '2026-11-01T10:00:00.000Z',
    closesAt: '2026-11-01T12:00:00.000Z',
    state: 'open',
    hubUrl: null,
    ...overrides,
});
const putAnchor = (userId, id, body) => request(app).put(`/api/rhythm/anchors/${id}`).set(as(userId)).send(body);
const putGate = (userId, id, body) => request(app).put(`/api/rhythm/gates/${id}`).set(as(userId)).send(body);
const patchAnchor = (userId, id, body) => request(app).patch(`/api/rhythm/anchors/${id}`).set(as(userId)).send(body);
const getAll = (userId) => request(app).get('/api/rhythm').set(as(userId));
const changes = (userId, since) => request(app).get('/api/rhythm/changes').query({ since }).set(as(userId));
// Recent enough that resync stays false, early enough to precede every write in a test.
const EPOCH = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

describe('PUT /api/rhythm/anchors/:id and /gates/:id', () => {
    test('creates then updates an anchor by external id, written by bourne', async () => {
        const userId = await createTestUser(getConn());

        const created = await putAnchor(userId, 'wake', anchor());
        const updated = await putAnchor(userId, 'wake', anchor({ time: '07:00', days: ['mon', 'wed'] }));

        expect(created.status).toBe(200);
        expect(created.body.data.created).toBe(true);
        expect(created.body.data.anchor).toMatchObject({ id: 'wake', time: '06:30', days: 'daily', updatedBy: 'bourne' });
        expect(updated.body.data.created).toBe(false);
        expect(updated.body.data.anchor).toMatchObject({ id: 'wake', time: '07:00', days: ['mon', 'wed'] });
        expect((await getAll(userId)).body.data.anchors).toHaveLength(1);
    });

    test('creates then updates a gate by external id, written by bourne', async () => {
        const userId = await createTestUser(getConn());

        const created = await putGate(userId, 'g1', gate());
        const updated = await putGate(userId, 'g1', gate({ state: 'green' }));

        expect(created.body.data.created).toBe(true);
        expect(created.body.data.gate).toMatchObject({ id: 'g1', state: 'open', updatedBy: 'bourne' });
        expect(updated.body.data.created).toBe(false);
        expect(updated.body.data.gate.state).toBe('green');
    });

    test.each([
        ['a bad id', 'bad id!', anchor()],
        ['an unknown field', 'wake', anchor({ extra: 1 })],
        ['a bad time', 'wake', anchor({ time: '25:00' })],
    ])('rejects %s with 400 and stores nothing', async (_label, id, body) => {
        const userId = await createTestUser(getConn());

        const response = await request(app).put(`/api/rhythm/anchors/${encodeURIComponent(id)}`).set(as(userId)).send(body);

        expect(response.status).toBe(400);
        expect((await getAll(userId)).body.data.anchors).toEqual([]);
    });

    test('rejects a gate that closes before it opens', async () => {
        const userId = await createTestUser(getConn());

        const response = await putGate(userId, 'g1', gate({ closesAt: '2026-11-01T09:00:00.000Z' }));

        expect(response.status).toBe(400);
        expect((await getAll(userId)).body.data.gates).toEqual([]);
    });

    test('401 without a token', async () => {
        const response = await request(app).put('/api/rhythm/anchors/wake').send(anchor());

        expect(response.status).toBe(401);
    });
});

describe('PATCH /api/rhythm/anchors/:id', () => {
    test('saves time, days and enabled as justin', async () => {
        const userId = await createTestUser(getConn());
        await putAnchor(userId, 'wake', anchor());

        const response = await patchAnchor(userId, 'wake', { time: '07:30', days: ['mon', 'wed'], enabled: false });

        expect(response.status).toBe(200);
        expect(response.body.data.anchor).toMatchObject({
            id: 'wake',
            title: 'Wake',
            time: '07:30',
            days: ['mon', 'wed'],
            enabled: false,
            updatedBy: 'justin',
        });
    });

    test('404 for an unknown id', async () => {
        const userId = await createTestUser(getConn());

        const response = await patchAnchor(userId, 'nope', { enabled: false });

        expect(response.status).toBe(404);
    });

    test.each([
        ['an empty body', {}],
        ['a bad time', { time: '7:30' }],
        ['a title', { title: 'Other' }],
    ])('rejects %s with 400 and changes nothing', async (_label, body) => {
        const userId = await createTestUser(getConn());
        await putAnchor(userId, 'wake', anchor());

        const response = await patchAnchor(userId, 'wake', body);

        expect(response.status).toBe(400);
        expect((await getAll(userId)).body.data.anchors[0]).toMatchObject({ title: 'Wake', time: '06:30', updatedBy: 'bourne' });
    });

    test("cannot change another user's anchor", async () => {
        const ownerId = await createTestUser(getConn());
        const otherId = await createTestUser(getConn());
        await putAnchor(ownerId, 'wake', anchor());

        const response = await patchAnchor(otherId, 'wake', { enabled: false });

        expect(response.status).toBe(404);
        expect((await getAll(ownerId)).body.data.anchors[0].enabled).toBe(true);
    });
});

describe('GET /api/rhythm and PUT /api/rhythm/zone', () => {
    test('timeZone is null until set, then returned with the items', async () => {
        const userId = await createTestUser(getConn());
        await putAnchor(userId, 'wake', anchor());
        await putGate(userId, 'g1', gate());

        const before = await getAll(userId);
        const zone = await request(app).put('/api/rhythm/zone').set(as(userId)).send({ timeZone: 'America/Chicago' });
        const after = await getAll(userId);

        expect(before.body.data.timeZone).toBeNull();
        expect(zone.status).toBe(200);
        expect(zone.body.data).toEqual({ timeZone: 'America/Chicago' });
        expect(after.body.data.timeZone).toBe('America/Chicago');
        expect(after.body.data.anchors[0]).toHaveProperty('updatedAt');
        expect(after.body.data.gates[0].id).toBe('g1');
    });

    test('rejects an unknown zone with 400', async () => {
        const userId = await createTestUser(getConn());

        const response = await request(app).put('/api/rhythm/zone').set(as(userId)).send({ timeZone: 'Mars/Base' });

        expect(response.status).toBe(400);
        expect((await getAll(userId)).body.data.timeZone).toBeNull();
    });

    test("never shows another user's items", async () => {
        const ownerId = await createTestUser(getConn());
        const otherId = await createTestUser(getConn());
        await putAnchor(ownerId, 'wake', anchor());

        const response = await getAll(otherId);

        expect(response.body.data.anchors).toEqual([]);
    });
});

describe('DELETE and GET /api/rhythm/changes', () => {
    test('delete answers { id, deleted: true } and a repeat is 404', async () => {
        const userId = await createTestUser(getConn());
        await putAnchor(userId, 'wake', anchor());

        const first = await request(app).delete('/api/rhythm/anchors/wake').set(as(userId));
        const second = await request(app).delete('/api/rhythm/anchors/wake').set(as(userId));

        expect(first.status).toBe(200);
        expect(first.body.data).toEqual({ id: 'wake', deleted: true });
        expect(second.status).toBe(404);
        expect((await getAll(userId)).body.data.anchors).toEqual([]);
    });

    test('changes reports upserts, justin edits and deletions since the cursor', async () => {
        const userId = await createTestUser(getConn());
        await request(app).put('/api/rhythm/zone').set(as(userId)).send({ timeZone: 'America/Chicago' });
        await putAnchor(userId, 'wake', anchor());
        await putAnchor(userId, 'walk', anchor({ title: 'Walk' }));
        await putGate(userId, 'g1', gate());
        await patchAnchor(userId, 'wake', { enabled: false });
        await request(app).delete('/api/rhythm/gates/g1').set(as(userId));

        const response = await changes(userId, EPOCH);

        expect(response.status).toBe(200);
        const data = response.body.data;
        expect(data.resync).toBe(false);
        expect(data.timeZone).toBe('America/Chicago');
        expect(data.cursor).toMatch(/Z$/);
        expect(data.anchors.map((a) => [a.id, a.updatedBy])).toEqual(
            expect.arrayContaining([
                ['wake', 'justin'],
                ['walk', 'bourne'],
            ])
        );
        expect(data.gates).toEqual([]);
        expect(data.deleted).toEqual([
            { kind: 'gate', id: 'g1', deletedAt: expect.stringMatching(/Z$/), deletedBy: 'bourne' },
        ]);
    });

    test('changes returns nothing when since is the cursor of an earlier call', async () => {
        const userId = await createTestUser(getConn());
        await putAnchor(userId, 'wake', anchor());
        const { cursor } = (await changes(userId, EPOCH)).body.data;

        const response = await changes(userId, cursor);

        expect(response.body.data.anchors).toEqual([]);
        expect(response.body.data.deleted).toEqual([]);
    });

    test('resync is true when since is over 30 days old', async () => {
        const userId = await createTestUser(getConn());
        const old = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
        const recent = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString();

        expect((await changes(userId, old)).body.data.resync).toBe(true);
        expect((await changes(userId, recent)).body.data.resync).toBe(false);
    });

    test.each([['missing', undefined], ['not an instant', 'yesterday']])('400 when since is %s', async (_label, since) => {
        const userId = await createTestUser(getConn());

        const response = await changes(userId, since);

        expect(response.status).toBe(400);
    });

    test("another user's deletions and edits are not reported", async () => {
        const ownerId = await createTestUser(getConn());
        const otherId = await createTestUser(getConn());
        await putAnchor(ownerId, 'wake', anchor());
        await request(app).delete('/api/rhythm/anchors/wake').set(as(ownerId));
        const unseen = await request(app).delete('/api/rhythm/anchors/wake').set(as(otherId));

        const response = await changes(otherId, EPOCH);

        expect(unseen.status).toBe(404);
        expect(response.body.data.deleted).toEqual([]);
    });
});
