'use strict';

const request = require('supertest');

const app = require('../../src/server');
const placesRepo = require('../../src/db/repositories/placesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const mk = (conn, ownerId, name, extra = {}) =>
    placesRepo.create(conn, { ownerId, name, address: `${name} St`, ...extra });

describe('GET /api/places', () => {
    test('returns only the caller’s places in the wire shape with the marked start', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const home = await mk(conn, ownerId, 'Home', { kind: 'home' });
        const work = await mk(conn, ownerId, 'Work', { kind: 'work', visitMinutes: 60 });
        await placesRepo.setDefaultStart(conn, ownerId, work.id);
        await mk(conn, strangerId, 'Theirs', { kind: 'home' });

        const response = await request(app).get('/api/places').set('Authorization', authHeaderFor(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            places: [
                { id: home.id, name: 'Home', address: 'Home St', kind: 'home', notes: null, visitMinutes: null, isDefaultStart: false },
                { id: work.id, name: 'Work', address: 'Work St', kind: 'work', notes: null, visitMinutes: 60, isDefaultStart: true },
            ],
            startPlaceId: work.id,
        });
    });

    test('falls back to the oldest home when none is marked', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'A', { kind: 'work' });
        const first = await mk(conn, ownerId, 'Z', { kind: 'home' });
        await mk(conn, ownerId, 'B', { kind: 'home' });

        const response = await request(app).get('/api/places').set('Authorization', authHeaderFor(ownerId));

        expect(response.body.data.startPlaceId).toBe(first.id);
    });

    test('returns an empty list and null start for a new user', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app).get('/api/places').set('Authorization', authHeaderFor(ownerId));

        expect(response.body.data).toEqual({ places: [], startPlaceId: null });
    });
});

describe('POST /api/places', () => {
    test('trims, stores and answers 201', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const response = await request(app)
            .post('/api/places')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ name: '  Acme ', address: ' 2 Elm  ', kind: 'client', visitMinutes: 720 });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({ name: 'Acme', address: '2 Elm', kind: 'client', visitMinutes: 720, isDefaultStart: false });
        const stored = await placesRepo.listByOwner(conn, ownerId);
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({ name: 'Acme', address: '2 Elm', kind: 'client', visit_minutes: 720 });
    });

    test('defaults kind to other and accepts null visitMinutes', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app)
            .post('/api/places')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ name: 'X', address: 'Y', visitMinutes: null });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({ kind: 'other', visitMinutes: null });
    });

    test.each([
        ['blank name', { name: '  ', address: 'a' }],
        ['missing name', { address: 'a' }],
        ['blank address', { name: 'n', address: ' ' }],
        ['unknown kind', { name: 'n', address: 'a', kind: 'castle' }],
        ['visitMinutes below 30', { name: 'n', address: 'a', visitMinutes: 0 }],
        ['visitMinutes 15', { name: 'n', address: 'a', visitMinutes: 15 }],
        ['visitMinutes off the 30 step', { name: 'n', address: 'a', visitMinutes: 45 }],
        ['visitMinutes above 720', { name: 'n', address: 'a', visitMinutes: 750 }],
        ['non-number visitMinutes', { name: 'n', address: 'a', visitMinutes: '60' }],
    ])('answers 400 and stores nothing for %s', async (_label, payload) => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const response = await request(app).post('/api/places').set('Authorization', authHeaderFor(ownerId)).send(payload);

        expect(response.status).toBe(400);
        expect(await placesRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});

describe('PATCH /api/places/:id', () => {
    const patch = (userId, id, body) =>
        request(app).patch(`/api/places/${id}`).set('Authorization', authHeaderFor(userId)).send(body);

    test('updates a subset of fields and leaves the rest', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mk(conn, ownerId, 'Old', { kind: 'work', notes: 'n' });

        const response = await patch(ownerId, place.id, { name: ' New ', visitMinutes: 30, notes: null });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: place.id, name: 'New', kind: 'work', notes: null, visitMinutes: 30 });
        expect(await placesRepo.findById(conn, place.id)).toMatchObject({ name: 'New', address: 'Old St', notes: null, visit_minutes: 30 });
    });

    test('isDefaultStart true unmarks the caller’s other places only', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const a = await mk(conn, ownerId, 'A');
        const b = await mk(conn, ownerId, 'B');
        const theirs = await mk(conn, strangerId, 'T');
        await placesRepo.setDefaultStart(conn, ownerId, a.id);
        await placesRepo.setDefaultStart(conn, strangerId, theirs.id);

        const response = await patch(ownerId, b.id, { isDefaultStart: true });

        expect(response.status).toBe(200);
        expect(response.body.data.isDefaultStart).toBe(true);
        expect((await placesRepo.findById(conn, a.id)).is_default_start).toBe(0);
        expect((await placesRepo.findById(conn, b.id)).is_default_start).toBe(1);
        expect((await placesRepo.findById(conn, theirs.id)).is_default_start).toBe(1);
    });

    test('isDefaultStart false clears the mark', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const a = await mk(conn, ownerId, 'A');
        await placesRepo.setDefaultStart(conn, ownerId, a.id);

        const response = await patch(ownerId, a.id, { isDefaultStart: false });

        expect(response.status).toBe(200);
        expect(response.body.data.isDefaultStart).toBe(false);
        expect((await placesRepo.findById(conn, a.id)).is_default_start).toBe(0);
    });

    test.each([
        ['an empty body', {}],
        ['blank name', { name: ' ' }],
        ['blank address', { address: '' }],
        ['unknown kind', { kind: 'castle' }],
        ['bad visitMinutes', { visitMinutes: 40 }],
        ['non-boolean isDefaultStart', { isDefaultStart: 'yes' }],
    ])('answers 400 and changes nothing for %s', async (_label, body) => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mk(conn, ownerId, 'Keep', { kind: 'work' });

        const response = await patch(ownerId, place.id, body);

        expect(response.status).toBe(400);
        expect(await placesRepo.findById(conn, place.id)).toEqual(place);
    });

    test('answers 403 for a stranger’s place and changes nothing, even the default mark', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await mk(conn, ownerId, 'Mine');

        const response = await patch(strangerId, place.id, { name: 'stolen', isDefaultStart: true });

        expect(response.status).toBe(403);
        expect(await placesRepo.findById(conn, place.id)).toEqual(place);
    });

    test('answers 404 for a missing place', async () => {
        const ownerId = await createTestUser(getConn());

        expect((await patch(ownerId, 987654321, { name: 'x' })).status).toBe(404);
    });
});

describe('DELETE /api/places/:id', () => {
    test('removes only that place and returns its id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const gone = await mk(conn, ownerId, 'Gone');
        const stays = await mk(conn, ownerId, 'Stays');

        const response = await request(app).delete(`/api/places/${gone.id}`).set('Authorization', authHeaderFor(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: gone.id });
        expect((await placesRepo.listByOwner(conn, ownerId)).map((r) => r.id)).toEqual([stays.id]);
    });

    test('answers 403 for a stranger’s place and keeps it', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await mk(conn, ownerId, 'Mine');

        const response = await request(app).delete(`/api/places/${place.id}`).set('Authorization', authHeaderFor(strangerId));

        expect(response.status).toBe(403);
        expect(await placesRepo.findById(conn, place.id)).toEqual(place);
    });

    test('answers 404 for a missing place', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app).delete('/api/places/987654321').set('Authorization', authHeaderFor(ownerId));

        expect(response.status).toBe(404);
    });
});

describe('auth', () => {
    test('answers 401 without a token', async () => {
        expect((await request(app).get('/api/places')).status).toBe(401);
    });
});
