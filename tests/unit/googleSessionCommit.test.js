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
const { encrypt } = require('../../src/lib/tokenCrypto');
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

    it('takes no connection from the caller', () => {
        expect(accessTokenFor.length).toBe(1);
    });
});
