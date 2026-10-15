'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/googleAccountsRepo');

const getConn = useTransaction();

const account = (overrides = {}) => ({
    email: 'me@gmail.com',
    refreshTokenEnc: 'refresh-cipher-1',
    accessTokenEnc: 'access-cipher-1',
    accessExpiresAt: 1790000000000,
    scopes: 'calendar.readonly email',
    ...overrides,
});

describe('googleAccountsRepo', () => {
    it('returns null when the user has no connection', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        expect(await repo.findByUser(conn, userId)).toBeNull();
    });

    it('upsert creates a row that findByUser returns camelCased with a numeric expiry', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        await repo.upsert(conn, { userId, ...account() });

        expect(await repo.findByUser(conn, userId)).toEqual({
            userId,
            email: 'me@gmail.com',
            refreshTokenEnc: 'refresh-cipher-1',
            accessTokenEnc: 'access-cipher-1',
            accessExpiresAt: 1790000000000,
            scopes: 'calendar.readonly email',
        });
    });

    it('upsert overwrites the single row on a second call', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        await repo.upsert(conn, { userId, ...account() });
        await repo.upsert(
            conn,
            {
                userId,
                ...account({
                    email: 'other@gmail.com',
                    refreshTokenEnc: 'refresh-cipher-2',
                    accessTokenEnc: 'access-cipher-2',
                    accessExpiresAt: 1790000999999,
                    scopes: 'email',
                }),
            }
        );

        const [[{ n }]] = await conn.execute(
            'SELECT COUNT(*) AS n FROM google_accounts WHERE user_id = ?',
            [userId]
        );
        expect(n).toBe(1);
        expect(await repo.findByUser(conn, userId)).toEqual({
            userId,
            email: 'other@gmail.com',
            refreshTokenEnc: 'refresh-cipher-2',
            accessTokenEnc: 'access-cipher-2',
            accessExpiresAt: 1790000999999,
            scopes: 'email',
        });
    });

    it('updateAccessToken changes only the access token and its expiry', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await repo.upsert(conn, { userId, ...account() });

        await repo.updateAccessToken(conn, userId, {
            accessTokenEnc: 'access-cipher-new',
            accessExpiresAt: 1790000555555,
        });

        expect(await repo.findByUser(conn, userId)).toEqual({
            userId,
            email: 'me@gmail.com',
            refreshTokenEnc: 'refresh-cipher-1',
            accessTokenEnc: 'access-cipher-new',
            accessExpiresAt: 1790000555555,
            scopes: 'calendar.readonly email',
        });
    });

    it('remove deletes the row', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await repo.upsert(conn, { userId, ...account() });

        await repo.remove(conn, userId);

        expect(await repo.findByUser(conn, userId)).toBeNull();
    });

    it('never reads or changes another user\'s row', async () => {
        const conn = getConn();
        const a = await createTestUser(conn);
        const b = await createTestUser(conn);
        await repo.upsert(conn, { userId: a, ...account({ email: 'a@gmail.com' }) });
        await repo.upsert(conn, { userId: b, ...account({ email: 'b@gmail.com' }) });

        await repo.updateAccessToken(conn, a, { accessTokenEnc: 'changed', accessExpiresAt: 1 });
        await repo.remove(conn, a);

        expect(await repo.findByUser(conn, a)).toBeNull();
        const rowB = await repo.findByUser(conn, b);
        expect(rowB.email).toBe('b@gmail.com');
        expect(rowB.accessTokenEnc).toBe('access-cipher-1');
        expect(rowB.accessExpiresAt).toBe(1790000000000);
    });

    it('deleting the user cascades to the row', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await repo.upsert(conn, { userId, ...account() });

        await conn.execute('DELETE FROM users WHERE id = ?', [userId]);

        expect(await repo.findByUser(conn, userId)).toBeNull();
    });
});
