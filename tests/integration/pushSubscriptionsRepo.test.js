'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/pushSubscriptionsRepo');

const getConn = useTransaction();

const sub = (endpoint, extra = {}) => ({ endpoint, p256dh: 'key1', auth: 'auth1', ...extra });

describe('pushSubscriptionsRepo', () => {
    it('save inserts, and saving the same endpoint again updates keys and owner without a new row', async () => {
        const conn = getConn();
        const first = await createTestUser(conn);
        const second = await createTestUser(conn);

        const a = await repo.save(conn, { ownerId: first, ...sub('https://push.example/a') });
        const b = await repo.save(conn, { ownerId: second, ...sub('https://push.example/a', { p256dh: 'key2', auth: 'auth2' }) });

        expect(b.id).toBe(a.id);
        expect(b).toMatchObject({ owner_id: second, endpoint: 'https://push.example/a', p256dh: 'key2', auth: 'auth2', last_success_at: null });
        expect(await repo.listByOwner(conn, first)).toEqual([]);
        expect(await repo.listByOwner(conn, second)).toHaveLength(1);
    });

    it('listByOwner and countByOwner only see that owner', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        const other = await createTestUser(conn);
        await repo.save(conn, { ownerId: owner, ...sub('https://push.example/1') });
        await repo.save(conn, { ownerId: owner, ...sub('https://push.example/2') });
        await repo.save(conn, { ownerId: other, ...sub('https://push.example/3') });

        const rows = await repo.listByOwner(conn, owner);

        expect(rows.map((r) => r.endpoint).sort()).toEqual(['https://push.example/1', 'https://push.example/2']);
        expect(await repo.countByOwner(conn, owner)).toBe(2);
        expect(await repo.countByOwner(conn, other)).toBe(1);
        expect(await repo.countByOwner(conn, 0)).toBe(0);
    });

    it('remove deletes by id and reports whether a row went', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        const row = await repo.save(conn, { ownerId: owner, ...sub('https://push.example/1') });

        expect(await repo.remove(conn, row.id)).toBe(true);
        expect(await repo.remove(conn, row.id)).toBe(false);
        expect(await repo.countByOwner(conn, owner)).toBe(0);
    });

    it('removeForOwner deletes only when owner and endpoint both match', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        const other = await createTestUser(conn);
        await repo.save(conn, { ownerId: owner, ...sub('https://push.example/1') });

        expect(await repo.removeForOwner(conn, other, 'https://push.example/1')).toBe(false);
        expect(await repo.removeForOwner(conn, owner, 'https://push.example/x')).toBe(false);
        expect(await repo.countByOwner(conn, owner)).toBe(1);
        expect(await repo.removeForOwner(conn, owner, 'https://push.example/1')).toBe(true);
        expect(await repo.countByOwner(conn, owner)).toBe(0);
    });

    it('markSuccess sets last_success_at on that row only', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        const a = await repo.save(conn, { ownerId: owner, ...sub('https://push.example/1') });
        await repo.save(conn, { ownerId: owner, ...sub('https://push.example/2') });

        await repo.markSuccess(conn, a.id);

        const rows = await repo.listByOwner(conn, owner);
        expect(rows.find((r) => r.id === a.id).last_success_at).not.toBeNull();
        expect(rows.filter((r) => r.last_success_at === null)).toHaveLength(1);
    });
});
