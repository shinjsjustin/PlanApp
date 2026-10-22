'use strict';

jest.mock('../../src/lib/push/webPush');

const request = require('supertest');

const app = require('../../src/server');
const webPush = require('../../src/lib/push/webPush');
const repo = require('../../src/db/repositories/pushSubscriptionsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const VAPID = { VAPID_SUBJECT: 'mailto:test@example.com', VAPID_PUBLIC_KEY: 'pub-key', VAPID_PRIVATE_KEY: 'priv-key' };
const savedEnv = { ...process.env };

beforeEach(() => {
    Object.assign(process.env, VAPID);
    webPush.sendNotification.mockReset();
});
afterAll(() => {
    process.env = savedEnv;
});

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const sub = (endpoint = 'https://push.example.com/abc') => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });
const subscribe = (userId, body) => request(app).post('/api/push/subscriptions').set(as(userId)).send(body);

describe('auth guard', () => {
    test.each([
        ['get', '/api/push/public-key'],
        ['post', '/api/push/subscriptions'],
        ['delete', '/api/push/subscriptions'],
        ['get', '/api/push/status'],
        ['post', '/api/push/test'],
    ])('%s %s answers 401 in the envelope without a token', async (method, path) => {
        const response = await request(app)[method](path);

        expect(response.status).toBe(401);
    });
});

describe('GET /api/push/public-key', () => {
    test('returns the VAPID public key', async () => {
        const userId = await createTestUser(getConn());

        const response = await request(app).get('/api/push/public-key').set(as(userId));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { publicKey: 'pub-key' }, error: null });
    });

    test('answers 503 when push is not configured', async () => {
        delete process.env.VAPID_PUBLIC_KEY;
        const userId = await createTestUser(getConn());

        const response = await request(app).get('/api/push/public-key').set(as(userId));

        expect(response.status).toBe(503);
        expect(response.body).toEqual({ success: false, data: null, error: 'Push is not configured' });
    });
});

describe('POST /api/push/subscriptions', () => {
    test('saves a valid subscription for the caller and answers 201', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        const response = await subscribe(userId, sub());

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        const rows = await repo.listByOwner(conn, userId);
        expect(rows.map((r) => [r.endpoint, r.p256dh, r.auth])).toEqual([['https://push.example.com/abc', 'p256dh-key', 'auth-key']]);
    });

    test.each([
        ['a non-URL endpoint', { endpoint: 'nope', keys: { p256dh: 'a', auth: 'b' } }],
        ['an http endpoint', { endpoint: 'http://push.example.com/x', keys: { p256dh: 'a', auth: 'b' } }],
        ['missing keys', { endpoint: 'https://push.example.com/x' }],
        ['a missing auth key', { endpoint: 'https://push.example.com/x', keys: { p256dh: 'a' } }],
        ['an empty p256dh key', { endpoint: 'https://push.example.com/x', keys: { p256dh: '', auth: 'b' } }],
        ['an over-long endpoint', { endpoint: `https://push.example.com/${'x'.repeat(500)}`, keys: { p256dh: 'a', auth: 'b' } }],
    ])('answers 400 for %s and stores nothing', async (_name, body) => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        const response = await subscribe(userId, body);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(await repo.countByOwner(conn, userId)).toBe(0);
    });
});

describe('DELETE /api/push/subscriptions', () => {
    test('removes the callers endpoint only', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await subscribe(userId, sub('https://push.example.com/one'));
        await subscribe(userId, sub('https://push.example.com/two'));

        const response = await request(app)
            .delete('/api/push/subscriptions')
            .set(as(userId))
            .send({ endpoint: 'https://push.example.com/one' });

        expect(response.status).toBe(200);
        expect((await repo.listByOwner(conn, userId)).map((r) => r.endpoint)).toEqual(['https://push.example.com/two']);
    });

    test('leaves another users subscription alone', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        const other = await createTestUser(conn);
        await subscribe(owner, sub());

        const response = await request(app).delete('/api/push/subscriptions').set(as(other)).send({ endpoint: sub().endpoint });

        expect(response.status).toBe(200);
        expect(await repo.countByOwner(conn, owner)).toBe(1);
    });

    test('answers 400 without an endpoint', async () => {
        const userId = await createTestUser(getConn());

        const response = await request(app).delete('/api/push/subscriptions').set(as(userId)).send({});

        expect(response.status).toBe(400);
    });
});

describe('GET /api/push/status', () => {
    test('is off with no devices', async () => {
        const userId = await createTestUser(getConn());

        const response = await request(app).get('/api/push/status').set(as(userId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ configured: true, on: false, devices: 0, lastSuccessAt: null });
    });

    test('is on when configured with a device, counting only the callers', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const other = await createTestUser(conn);
        await subscribe(userId, sub('https://push.example.com/one'));
        await subscribe(other, sub('https://push.example.com/two'));

        const response = await request(app).get('/api/push/status').set(as(userId));

        expect(response.body.data).toEqual({ configured: true, on: true, devices: 1, lastSuccessAt: null });
    });

    test('is off when devices exist but push is not configured', async () => {
        const userId = await createTestUser(getConn());
        await subscribe(userId, sub());
        delete process.env.VAPID_PRIVATE_KEY;

        const response = await request(app).get('/api/push/status').set(as(userId));

        expect(response.body.data).toEqual({ configured: false, on: false, devices: 1, lastSuccessAt: null });
    });

    test('reports the latest successful send as a UTC instant', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await subscribe(userId, sub());
        await conn.execute("UPDATE push_subscriptions SET last_success_at = '2026-10-22 18:30:15' WHERE owner_id = ?", [userId]);

        const response = await request(app).get('/api/push/status').set(as(userId));

        expect(response.body.data.lastSuccessAt).toBe('2026-10-22T18:30:15.000Z');
    });
});

describe('POST /api/push/test', () => {
    test('sends the test payload to each device and reports the counts', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await subscribe(userId, sub('https://push.example.com/one'));
        await subscribe(userId, sub('https://push.example.com/two'));
        webPush.sendNotification.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));

        const response = await request(app).post('/api/push/test').set(as(userId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ sent: 1, failed: 0, removed: 1 });
        expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
        expect(webPush.sendNotification.mock.calls[0][1]).toEqual({ title: 'ShinPlan', body: 'Push is working', url: '/reminders' });
        expect(await repo.countByOwner(conn, userId)).toBe(1);
    });

    test('answers 409 with no devices and sends nothing', async () => {
        const userId = await createTestUser(getConn());

        const response = await request(app).post('/api/push/test').set(as(userId));

        expect(response.status).toBe(409);
        expect(response.body.success).toBe(false);
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    test('answers 503 when push is not configured', async () => {
        const userId = await createTestUser(getConn());
        await subscribe(userId, sub());
        delete process.env.VAPID_SUBJECT;

        const response = await request(app).post('/api/push/test').set(as(userId));

        expect(response.status).toBe(503);
    });
});
