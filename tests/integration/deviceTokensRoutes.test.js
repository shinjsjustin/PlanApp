'use strict';

const crypto = require('node:crypto');
const request = require('supertest');

const app = require('../../src/server');
const repo = require('../../src/db/repositories/deviceTokensRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const create = (userId, body) => request(app).post('/api/device-tokens').set(as(userId)).send(body);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

describe('auth guard', () => {
    test.each([
        ['get', '/api/device-tokens'],
        ['post', '/api/device-tokens'],
        ['delete', '/api/device-tokens/1'],
    ])('%s %s answers 401 without a token', async (method, path) => {
        const response = await request(app)[method](path);

        expect(response.status).toBe(401);
    });
});

describe('POST /api/device-tokens', () => {
    test('creates a token shown once and stores only its sha256 hash', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        const response = await create(userId, { name: 'iPhone' });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        const { id, name, token, createdAt } = response.body.data;
        expect(name).toBe('iPhone');
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(new Date(createdAt).toISOString()).toBe(createdAt);
        const [rows] = await conn.execute('SELECT * FROM device_tokens WHERE id = ?', [id]);
        expect(rows[0].token_hash).toBe(sha256(token));
        expect(rows[0].owner_id).toBe(userId);
        expect(JSON.stringify(rows[0])).not.toContain(token);
    });

    test('issues a different token each time', async () => {
        const userId = await createTestUser(getConn());

        const one = await create(userId, { name: 'a' });
        const two = await create(userId, { name: 'b' });

        expect(one.body.data.token).not.toBe(two.body.data.token);
    });

    test.each([
        ['a missing name', {}],
        ['an empty name', { name: '' }],
        ['a non-string name', { name: 5 }],
        ['a 101 character name', { name: 'x'.repeat(101) }],
    ])('answers 400 for %s and stores nothing', async (_label, body) => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        const response = await create(userId, body);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(await repo.listByOwner(conn, userId)).toEqual([]);
    });

    test('accepts a 100 character name', async () => {
        const userId = await createTestUser(getConn());

        const response = await create(userId, { name: 'x'.repeat(100) });

        expect(response.status).toBe(201);
    });
});

describe('GET /api/device-tokens', () => {
    test('lists only the callers tokens without the token or hash', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const other = await createTestUser(conn);
        const mine = await create(userId, { name: 'mine' });
        await create(other, { name: 'theirs' });

        const response = await request(app).get('/api/device-tokens').set(as(userId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([
            { id: mine.body.data.id, name: 'mine', lastUsedAt: null, createdAt: mine.body.data.createdAt },
        ]);
        expect(JSON.stringify(response.body)).not.toContain(mine.body.data.token);
    });

    test('reports last use as a UTC instant after touch', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const { body } = await create(userId, { name: 'mine' });
        await conn.execute("UPDATE device_tokens SET last_used_at = '2026-10-22 18:30:15' WHERE id = ?", [body.data.id]);

        const response = await request(app).get('/api/device-tokens').set(as(userId));

        expect(response.body.data[0].lastUsedAt).toBe('2026-10-22T18:30:15.000Z');
    });
});

describe('DELETE /api/device-tokens/:id', () => {
    test('removes the callers token so it no longer authenticates', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const { body } = await create(userId, { name: 'mine' });

        const response = await request(app).delete(`/api/device-tokens/${body.data.id}`).set(as(userId));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { id: body.data.id }, error: null });
        expect(await repo.findByToken(conn, body.data.token)).toBeNull();
    });

    test('answers 404 for another users token and keeps it', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        const other = await createTestUser(conn);
        const { body } = await create(owner, { name: 'mine' });

        const response = await request(app).delete(`/api/device-tokens/${body.data.id}`).set(as(other));

        expect(response.status).toBe(404);
        expect(await repo.findByToken(conn, body.data.token)).not.toBeNull();
    });

    test.each(['999999999', 'abc'])('answers 404 for id %s', async (id) => {
        const userId = await createTestUser(getConn());

        const response = await request(app).delete(`/api/device-tokens/${id}`).set(as(userId));

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });
});

describe('deviceTokensRepo', () => {
    test('findByToken returns id and owner for a live token, else null', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const { body } = await create(userId, { name: 'mine' });

        expect(await repo.findByToken(conn, body.data.token)).toEqual({ id: body.data.id, owner_id: userId });
        expect(await repo.findByToken(conn, 'x'.repeat(43))).toBeNull();
    });

    test('touch sets last_used_at', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const { body } = await create(userId, { name: 'mine' });

        await repo.touch(conn, body.data.id);

        const [rows] = await conn.execute('SELECT last_used_at FROM device_tokens WHERE id = ?', [body.data.id]);
        expect(rows[0].last_used_at).not.toBeNull();
    });
});
