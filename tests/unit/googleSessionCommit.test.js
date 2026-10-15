'use strict';

jest.mock('../../src/db/unitOfWork');
jest.mock('../../src/db/repositories/googleAccountsRepo');
jest.mock('../../src/lib/google/oauth', () => ({
    SCOPES: [],
    exchangeCode: jest.fn(),
    refreshAccessToken: jest.fn(),
    revokeToken: jest.fn(),
}));

const unitOfWork = require('../../src/db/unitOfWork');
const googleAccountsRepo = require('../../src/db/repositories/googleAccountsRepo');
const { refreshAccessToken } = require('../../src/lib/google/oauth');
const { encrypt, decrypt } = require('../../src/lib/tokenCrypto');
const { accessTokenFor } = require('../../src/lib/google/session');

const USER_ID = 7;
const NOW = 1000000;
const FAKE_CONN = { name: 'fake-conn' };

describe('accessTokenFor on invalid_grant', () => {
    let events;

    beforeEach(() => {
        events = [];
        unitOfWork.withConnection.mockImplementation((fn) => fn(FAKE_CONN));
        googleAccountsRepo.findByUser.mockResolvedValue({
            refreshTokenEnc: encrypt('refresh'),
            accessTokenEnc: encrypt('access'),
            accessExpiresAt: NOW - 1,
        });
        googleAccountsRepo.remove.mockImplementation(async () => {
            events.push('remove');
        });
        unitOfWork.withTransaction.mockImplementation(async (fn) => {
            events.push('tx-start');
            const result = await fn(FAKE_CONN);
            await Promise.resolve();
            events.push('tx-settled');
            return result;
        });
        refreshAccessToken.mockRejectedValue(Object.assign(new Error('revoked'), { code: 'invalid_grant' }));
    });

    it('removes the row inside a transaction that settles before the 409', async () => {
        const rejection = accessTokenFor(USER_ID, () => NOW).catch((err) => {
            events.push('rejected');
            return err;
        });
        const err = await rejection;

        expect(events).toEqual(['tx-start', 'remove', 'tx-settled', 'rejected']);
        expect(googleAccountsRepo.remove).toHaveBeenCalledWith(FAKE_CONN, USER_ID);
        expect(err.status).toBe(409);
        expect(err.message).toBe('Google not connected');
    });
});

describe('accessTokenFor on a live or expired token', () => {
    let events;

    beforeEach(() => {
        jest.clearAllMocks();
        events = [];
        unitOfWork.withConnection.mockImplementation((fn) => fn(FAKE_CONN));
        unitOfWork.withTransaction.mockImplementation(async (fn) => {
            events.push('tx-start');
            const result = await fn(FAKE_CONN);
            await Promise.resolve();
            events.push('tx-settled');
            return result;
        });
    });

    it('reads a valid token through withConnection without opening a transaction', async () => {
        googleAccountsRepo.findByUser.mockResolvedValue({
            refreshTokenEnc: encrypt('refresh'),
            accessTokenEnc: encrypt('access'),
            accessExpiresAt: NOW + 10 * 60 * 1000,
        });

        const token = await accessTokenFor(USER_ID, () => NOW);

        expect(token).toBe('access');
        expect(unitOfWork.withConnection).toHaveBeenCalledTimes(1);
        expect(googleAccountsRepo.findByUser).toHaveBeenCalledWith(FAKE_CONN, USER_ID);
        expect(unitOfWork.withTransaction).not.toHaveBeenCalled();
        expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('writes a refreshed token inside a transaction that settles before resolving', async () => {
        googleAccountsRepo.findByUser.mockResolvedValue({
            refreshTokenEnc: encrypt('refresh'),
            accessTokenEnc: encrypt('stale'),
            accessExpiresAt: NOW - 1,
        });
        refreshAccessToken.mockResolvedValue({ access_token: 'fresh', expires_in: 3600 });
        googleAccountsRepo.updateAccessToken.mockImplementation(async () => {
            events.push('update');
        });

        const token = await accessTokenFor(USER_ID, () => NOW);
        events.push('resolved');

        expect(events).toEqual(['tx-start', 'update', 'tx-settled', 'resolved']);
        expect(token).toBe('fresh');
        expect(refreshAccessToken).toHaveBeenCalledWith('refresh');
        const [conn, userId, update] = googleAccountsRepo.updateAccessToken.mock.calls[0];
        expect(conn).toBe(FAKE_CONN);
        expect(userId).toBe(USER_ID);
        expect(update.accessExpiresAt).toBe(NOW + 3600 * 1000);
        expect(decrypt(update.accessTokenEnc)).toBe('fresh');
    });
});
