'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/thoughtsRepo');

const getConn = useTransaction();

const setCreatedAt = (conn, id, createdAt) =>
    conn.execute('UPDATE thoughts SET created_at = ? WHERE id = ?', [createdAt, id]);

describe('thoughtsRepo', () => {
    it('create returns the new row and findById returns it, or null when missing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const created = await repo.create(conn, { ownerId, text: 'buy milk' });

        expect(Object.keys(created).sort()).toEqual(['created_at', 'id', 'owner_id', 'text']);
        expect(created).toMatchObject({ owner_id: ownerId, text: 'buy milk' });
        expect(created.created_at).toBeInstanceOf(Date);
        expect(await repo.findById(conn, created.id)).toEqual(created);
        expect(await repo.findById(conn, 0)).toBeNull();
    });

    it('listByOwner returns only that owner\'s rows, newest first with id as tie-break', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);

        const oldest = await repo.create(conn, { ownerId, text: 'oldest' });
        const tieA = await repo.create(conn, { ownerId, text: 'tie a' });
        const tieB = await repo.create(conn, { ownerId, text: 'tie b' });
        await repo.create(conn, { ownerId: otherId, text: 'not mine' });
        await setCreatedAt(conn, oldest.id, '2026-01-01 00:00:00');
        await setCreatedAt(conn, tieA.id, '2026-02-01 00:00:00');
        await setCreatedAt(conn, tieB.id, '2026-02-01 00:00:00');

        const rows = await repo.listByOwner(conn, ownerId);

        expect(rows.map((r) => r.text)).toEqual(['tie b', 'tie a', 'oldest']);
    });

    it('update changes text only, leaves created_at alone, and returns null for a missing id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, text: 'before' });
        await setCreatedAt(conn, created.id, '2026-01-01 00:00:00');
        const before = await repo.findById(conn, created.id);

        const updated = await repo.update(conn, created.id, { text: 'after' });

        expect(updated).toEqual({ ...before, text: 'after' });
        expect(await repo.update(conn, 0, { text: 'x' })).toBeNull();
    });

    it('remove returns true for a deleted row and false for a missing one', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, text: 'gone' });

        expect(await repo.remove(conn, created.id)).toBe(true);
        expect(await repo.findById(conn, created.id)).toBeNull();
        expect(await repo.remove(conn, created.id)).toBe(false);
    });

    it('removeAllByOwner returns the count removed and leaves other owners\' rows', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await repo.create(conn, { ownerId, text: 'a' });
        await repo.create(conn, { ownerId, text: 'b' });
        await repo.create(conn, { ownerId: otherId, text: 'keep' });

        expect(await repo.removeAllByOwner(conn, ownerId)).toBe(2);
        expect(await repo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await repo.listByOwner(conn, otherId)).toHaveLength(1);
        expect(await repo.removeAllByOwner(conn, ownerId)).toBe(0);
    });

    it('deleting the user cascades to their thoughts', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, text: 'cascade' });

        await conn.execute('DELETE FROM users WHERE id = ?', [ownerId]);

        expect(await repo.findById(conn, created.id)).toBeNull();
    });
});
