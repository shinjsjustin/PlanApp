'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/googleExportsRepo');

const getConn = useTransaction();

const countFor = async (conn, userId) => {
    const [[{ n }]] = await conn.execute(
        'SELECT COUNT(*) AS n FROM google_exports WHERE user_id = ?',
        [userId]
    );
    return n;
};

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('googleExportsRepo', () => {
    it('upsert stores bodyHash, and a second upsert replaces googleEventId and bodyHash without a second row', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);

        await repo.upsert(conn, { userId, itemKey: 'todo:1', googleEventId: 'evt-a', bodyHash: HASH_A });
        expect(await repo.listByUser(conn, userId)).toEqual([
            { itemKey: 'todo:1', googleEventId: 'evt-a', bodyHash: HASH_A },
        ]);

        await repo.upsert(conn, { userId, itemKey: 'todo:1', googleEventId: 'evt-b', bodyHash: HASH_B });

        expect(await countFor(conn, userId)).toBe(1);
        expect(await repo.listByUser(conn, userId)).toEqual([
            { itemKey: 'todo:1', googleEventId: 'evt-b', bodyHash: HASH_B },
        ]);
    });

    it('upsert without bodyHash stores null, and listByUser orders one user\'s rows by itemKey', async () => {
        const conn = getConn();
        const a = await createTestUser(conn);
        const b = await createTestUser(conn);
        await repo.upsert(conn, { userId: a, itemKey: 'todo:2', googleEventId: 'e2' });
        await repo.upsert(conn, { userId: a, itemKey: 'sequence:9', googleEventId: 'e9', bodyHash: HASH_A });
        await repo.upsert(conn, { userId: b, itemKey: 'todo:1', googleEventId: 'eb' });

        expect(await repo.listByUser(conn, a)).toEqual([
            { itemKey: 'sequence:9', googleEventId: 'e9', bodyHash: HASH_A },
            { itemKey: 'todo:2', googleEventId: 'e2', bodyHash: null },
        ]);
    });

    it('an upsert without bodyHash clears a previously stored hash', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await repo.upsert(conn, { userId, itemKey: 'todo:1', googleEventId: 'e1', bodyHash: HASH_A });
        await repo.upsert(conn, { userId, itemKey: 'todo:1', googleEventId: 'e1' });

        expect(await repo.listByUser(conn, userId)).toEqual([
            { itemKey: 'todo:1', googleEventId: 'e1', bodyHash: null },
        ]);
    });

    it('remove deletes just that row, and deleting the user cascades', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const other = await createTestUser(conn);
        await repo.upsert(conn, { userId, itemKey: 'todo:1', googleEventId: 'e1' });
        await repo.upsert(conn, { userId, itemKey: 'todo:2', googleEventId: 'e2' });
        await repo.upsert(conn, { userId: other, itemKey: 'todo:1', googleEventId: 'eo' });

        await repo.remove(conn, userId, 'todo:1');

        expect(await repo.listByUser(conn, userId)).toEqual([
            { itemKey: 'todo:2', googleEventId: 'e2', bodyHash: null },
        ]);
        expect(await repo.listByUser(conn, other)).toHaveLength(1);

        await conn.execute('DELETE FROM users WHERE id = ?', [userId]);
        expect(await countFor(conn, userId)).toBe(0);
    });
});
