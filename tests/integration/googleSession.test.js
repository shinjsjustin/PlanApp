'use strict';

const jwt = require('jsonwebtoken');

const googleAccountsRepo = require('../../src/db/repositories/googleAccountsRepo');
const { decrypt, encrypt } = require('../../src/lib/tokenCrypto');
const session = require('../../src/lib/google/session');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const NOW = 1_000_000_000_000;
const now = () => NOW;
const NOT_CONNECTED = { status: 409, message: 'Google not connected' };

const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

let fetchMock;
let savedEnv;

beforeEach(() => {
    savedEnv = { ...process.env };
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/cb';
    fetchMock = jest.spyOn(global, 'fetch');
});

afterEach(() => {
    fetchMock.mockRestore();
    process.env = savedEnv;
});

const idToken = (email) => jwt.sign({ email }, 'irrelevant');

const seedRow = async (conn, userId, { expiresAt, access = 'old-access' }) => {
    await googleAccountsRepo.upsert(conn, {
        userId,
        email: 'a@example.com',
        refreshTokenEnc: encrypt('the-refresh'),
        accessTokenEnc: encrypt(access),
        accessExpiresAt: expiresAt,
        scopes: 'openid email',
    });
};

describe('connectWithCode', () => {
    test('stores email and encrypted tokens, no plaintext', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        fetchMock.mockResolvedValue(
            jsonResponse(200, {
                access_token: 'acc-1',
                refresh_token: 'ref-1',
                expires_in: 3600,
                id_token: idToken('me@example.com'),
            })
        );

        await session.connectWithCode(conn, userId, 'code-1', now);

        const row = await googleAccountsRepo.findByUser(conn, userId);
        expect(row.email).toBe('me@example.com');
        expect(row.accessExpiresAt).toBe(NOW + 3600 * 1000);
        expect(row.accessTokenEnc).not.toContain('acc-1');
        expect(row.refreshTokenEnc).not.toContain('ref-1');
        expect(decrypt(row.accessTokenEnc)).toBe('acc-1');
        expect(decrypt(row.refreshTokenEnc)).toBe('ref-1');
    });

    test('throws 409 and stores nothing without a refresh_token', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        fetchMock.mockResolvedValue(
            jsonResponse(200, { access_token: 'a', expires_in: 3600, id_token: idToken('me@example.com') })
        );

        await expect(session.connectWithCode(conn, userId, 'c', now)).rejects.toMatchObject(NOT_CONNECTED);
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });
});

describe('accessTokenFor', () => {
    test('returns the stored token with over 60 s left', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedRow(conn, userId, { expiresAt: NOW + 61_000 });

        expect(await session.accessTokenFor(conn, userId, now)).toBe('old-access');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('refreshes, stores and returns a new token with 60 s or less left', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedRow(conn, userId, { expiresAt: NOW + 60_000 });
        fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'new-access', expires_in: 1800 }));

        expect(await session.accessTokenFor(conn, userId, now)).toBe('new-access');

        const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
        expect(body.get('refresh_token')).toBe('the-refresh');
        const row = await googleAccountsRepo.findByUser(conn, userId);
        expect(decrypt(row.accessTokenEnc)).toBe('new-access');
        expect(row.accessExpiresAt).toBe(NOW + 1800 * 1000);
    });

    test('throws 409 when no row exists', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        await expect(session.accessTokenFor(conn, userId, now)).rejects.toMatchObject(NOT_CONNECTED);
    });

    test('deletes the row and throws 409 when refresh fails with invalid_grant', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedRow(conn, userId, { expiresAt: NOW - 1 });
        fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));

        await expect(session.accessTokenFor(conn, userId, now)).rejects.toMatchObject(NOT_CONNECTED);
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test('keeps the row and rethrows other refresh failures', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedRow(conn, userId, { expiresAt: NOW - 1 });
        fetchMock.mockResolvedValue(jsonResponse(500, { error: 'backend_error' }));

        await expect(session.accessTokenFor(conn, userId, now)).rejects.toMatchObject({ code: 'backend_error' });
        expect(await googleAccountsRepo.findByUser(conn, userId)).not.toBeNull();
    });
});

describe('disconnect', () => {
    test('revokes the refresh token and deletes the row', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedRow(conn, userId, { expiresAt: NOW + 100_000 });
        fetchMock.mockResolvedValue(jsonResponse(200, {}));

        await session.disconnect(conn, userId);

        expect(fetchMock.mock.calls[0][0]).toContain('/revoke');
        expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('token')).toBe('the-refresh');
        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test('deletes the row even if revoke fails', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedRow(conn, userId, { expiresAt: NOW + 100_000 });
        fetchMock.mockRejectedValue(new Error('network down'));

        await session.disconnect(conn, userId);

        expect(await googleAccountsRepo.findByUser(conn, userId)).toBeNull();
    });

    test('is a no-op without a row', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        await session.disconnect(conn, userId);

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
