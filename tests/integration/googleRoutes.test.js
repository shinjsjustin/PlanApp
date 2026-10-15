'use strict';

const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../../src/server');
const googleAccountsRepo = require('../../src/db/repositories/googleAccountsRepo');
const { encrypt } = require('../../src/lib/tokenCrypto');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');
const { signState, verifyState } = require('../../src/lib/google/oauthState');

const getConn = useTransaction();

const CLIENT = 'http://client.test';
const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

let fetchMock;
let savedEnv;

beforeEach(() => {
    savedEnv = { ...process.env };
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/cb';
    process.env.CLIENT_URL = CLIENT;
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    fetchMock.mockRestore();
    console.error.mockRestore();
    process.env = savedEnv;
});

const seedAccount = (conn, userId) =>
    googleAccountsRepo.upsert(conn, {
        userId,
        email: 'g@example.com',
        refreshTokenEnc: encrypt('the-refresh'),
        accessTokenEnc: encrypt('the-access'),
        accessExpiresAt: Date.now() + 3600_000,
        scopes: 'openid email',
    });

const tokenResponse = () =>
    jsonResponse(200, {
        access_token: 'acc',
        refresh_token: 'ref',
        expires_in: 3600,
        id_token: jwt.sign({ email: 'new@example.com' }, 'x'),
    });

const callback = (query) => request(app).get('/api/google/callback').query(query);

describe('GET /api/google/status', () => {
    test('is 401 without a token', async () => {
        const response = await request(app).get('/api/google/status');
        expect(response.status).toBe(401);
    });

    test('reports not connected when the caller has no account', async () => {
        const userId = await createTestUser(getConn());
        const response = await request(app).get('/api/google/status').set('Authorization', authHeaderFor(userId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ connected: false });
    });

    test('reports the caller email only, never another users account', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        const other = await createTestUser(conn);
        await seedAccount(conn, owner);

        const mine = await request(app).get('/api/google/status').set('Authorization', authHeaderFor(owner));
        const theirs = await request(app).get('/api/google/status').set('Authorization', authHeaderFor(other));

        expect(mine.body.data).toEqual({ connected: true, email: 'g@example.com' });
        expect(theirs.body.data).toEqual({ connected: false });
    });
});

describe('POST /api/google/connect', () => {
    test('answers a url whose state verifies to the caller', async () => {
        const userId = await createTestUser(getConn());
        const response = await request(app).post('/api/google/connect').set('Authorization', authHeaderFor(userId));

        expect(response.status).toBe(200);
        const url = new URL(response.body.data.url);
        expect(verifyState(url.searchParams.get('state'))).toBe(userId);
    });

    test('the state is refused as a login token by status', async () => {
        const userId = await createTestUser(getConn());
        const connect = await request(app).post('/api/google/connect').set('Authorization', authHeaderFor(userId));
        const state = new URL(connect.body.data.url).searchParams.get('state');

        const response = await request(app).get('/api/google/status').set('Authorization', `Bearer ${state}`);

        expect(response.status).toBe(403);
    });

    test('isAuth refuses a login-signed token carrying a purpose claim', async () => {
        const userId = await createTestUser(getConn());
        const token = jwt.sign({ id: userId, purpose: 'anything' }, process.env.JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app).get('/api/google/status').set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'Token is INVALID' });
    });

    test('is 503 when Google is not configured', async () => {
        delete process.env.GOOGLE_CLIENT_ID;
        const userId = await createTestUser(getConn());
        const response = await request(app).post('/api/google/connect').set('Authorization', authHeaderFor(userId));

        expect(response.status).toBe(503);
    });

    test('is 401 without a token', async () => {
        const response = await request(app).post('/api/google/connect');
        expect(response.status).toBe(401);
    });
});

describe('GET /api/google/callback', () => {
    test('with a valid state makes no Google call and redirects with code and state', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const state = signState(userId);

        const response = await callback({ code: 'c 1/&', state });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            `${CLIENT}/calendar?google=complete&code=${encodeURIComponent('c 1/&')}&state=${encodeURIComponent(state)}`
        );
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test.each([
        ['a garbage state', () => 'nope'],
        ['a login token as state', (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '10m' })],
    ])('redirects to error for %s', async (_name, makeState) => {
        const userId = await createTestUser(getConn());

        const response = await callback({ code: 'c1', state: makeState(userId) });

        expect(response.headers.location).toBe(`${CLIENT}/calendar?google=error`);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('redirects to error when Google sends an error param', async () => {
        const userId = await createTestUser(getConn());

        const response = await callback({ error: 'access_denied', state: signState(userId) });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CLIENT}/calendar?google=error`);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('redirects to error when the code is missing', async () => {
        const userId = await createTestUser(getConn());

        const response = await callback({ state: signState(userId) });

        expect(response.headers.location).toBe(`${CLIENT}/calendar?google=error`);
    });
});

describe('POST /api/google/complete', () => {
    const complete = (userId, body) =>
        request(app).post('/api/google/complete').set('Authorization', authHeaderFor(userId)).send(body);

    test('stores the account for the same user and answers connected with the email', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        fetchMock.mockResolvedValue(tokenResponse());

        const response = await complete(userId, { code: 'c1', state: signState(userId) });

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ connected: true, email: 'new@example.com' });
        expect((await googleAccountsRepo.findByUser(conn, userId)).email).toBe('new@example.com');
    });

    test('is 403 and stores nothing for a state minted for another user', async () => {
        const conn = getConn();
        const victim = await createTestUser(conn);
        const attacker = await createTestUser(conn);

        const response = await complete(victim, { code: 'c1', state: signState(attacker) });

        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await googleAccountsRepo.findByUser(conn, victim)).toBeNull();
        expect(await googleAccountsRepo.findByUser(conn, attacker)).toBeNull();
    });

    test('is 400 for a bad state', async () => {
        const userId = await createTestUser(getConn());

        const response = await complete(userId, { code: 'c1', state: 'nope' });

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('is 409 Google not connected and stores nothing when the exchange fails', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));

        const response = await complete(userId, { code: 'bad', state: signState(userId) });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Google not connected');
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test('is 401 without a token', async () => {
        const response = await request(app).post('/api/google/complete').send({ code: 'c', state: 's' });
        expect(response.status).toBe(401);
    });
});

describe('DELETE /api/google/connection', () => {
    test('revokes, removes the account and leaks no token', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        fetchMock.mockResolvedValue(jsonResponse(200, {}));

        const response = await request(app).delete('/api/google/connection').set('Authorization', authHeaderFor(userId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ connected: false });
        expect(JSON.stringify(response.body)).not.toMatch(/the-refresh|the-access/);
        expect(fetchMock.mock.calls[0][0]).toContain('revoke');
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test('is 401 without a token', async () => {
        const response = await request(app).delete('/api/google/connection');
        expect(response.status).toBe(401);
    });
});
