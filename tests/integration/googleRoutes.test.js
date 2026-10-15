'use strict';

const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../../src/server');
const googleAccountsRepo = require('../../src/db/repositories/googleAccountsRepo');
const { encrypt } = require('../../src/lib/tokenCrypto');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

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

const stateFor = (userId, { purpose = 'google-oauth', expiresIn = '10m' } = {}) =>
    jwt.sign({ id: userId, purpose }, process.env.JWT_SECRET, { expiresIn });

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
    test('answers a url whose state is a 10 minute google-oauth JWT for the caller', async () => {
        const userId = await createTestUser(getConn());
        const response = await request(app).post('/api/google/connect').set('Authorization', authHeaderFor(userId));

        expect(response.status).toBe(200);
        const url = new URL(response.body.data.url);
        const state = jwt.verify(url.searchParams.get('state'), process.env.JWT_SECRET);
        expect(state).toMatchObject({ id: userId, purpose: 'google-oauth' });
        expect(state.exp - state.iat).toBe(600);
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
    test('stores the account and redirects to connected', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        fetchMock.mockResolvedValue(
            jsonResponse(200, {
                access_token: 'acc',
                refresh_token: 'ref',
                expires_in: 3600,
                id_token: jwt.sign({ email: 'new@example.com' }, 'x'),
            })
        );

        const response = await callback({ code: 'c1', state: stateFor(userId) });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CLIENT}/calendar?google=connected`);
        expect((await googleAccountsRepo.findByUser(conn, userId)).email).toBe('new@example.com');
    });

    test.each([
        ['a garbage state', () => 'nope'],
        ['an expired state', (id) => stateFor(id, { expiresIn: -10 })],
        ['a state with another purpose', (id) => stateFor(id, { purpose: 'login' })],
    ])('redirects to error and stores nothing for %s', async (_name, makeState) => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        const response = await callback({ code: 'c1', state: makeState(userId) });

        expect(response.headers.location).toBe(`${CLIENT}/calendar?google=error`);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test('redirects to error when Google sends an error param', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        const response = await callback({ error: 'access_denied', state: stateFor(userId) });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CLIENT}/calendar?google=error`);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test('redirects to error and stores nothing when the exchange fails', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));

        const response = await callback({ code: 'bad', state: stateFor(userId) });

        expect(response.headers.location).toBe(`${CLIENT}/calendar?google=error`);
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
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
