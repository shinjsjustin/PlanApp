'use strict';

const repo = require('../../src/db/repositories/rhythmRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ANCHOR = { title: 'Stretch', description: null, at_minutes: 480, weekdays: 127, enabled: 1 };
const GATE = {
    title: 'Plan review',
    kind: 'plan',
    opens_at: '2026-11-20 09:00:00.000',
    closes_at: '2026-11-20 10:00:00.000',
    state: 'open',
    hub_url: null,
};

const setUpdatedAt = (conn, table, ownerId, externalId, value) =>
    conn.execute(`UPDATE ${table} SET updated_at = ? WHERE owner_id = ? AND external_id = ?`, [
        value,
        ownerId,
        externalId,
    ]);

describe('rhythmRepo', () => {
    let ownerId;
    let otherId;

    beforeEach(async () => {
        ownerId = await createTestUser(getConn());
        otherId = await createTestUser(getConn());
    });

    describe('zone', () => {
        it('returns null until set, then the stored zone, replacing on a second set', async () => {
            const conn = getConn();
            expect(await repo.getZone(conn, ownerId)).toBeNull();

            await repo.setZone(conn, ownerId, 'America/Chicago');
            await repo.setZone(conn, ownerId, 'Europe/Paris');

            expect(await repo.getZone(conn, ownerId)).toBe('Europe/Paris');
            expect(await repo.getZone(conn, otherId)).toBeNull();
        });
    });

    describe('upsertAnchor', () => {
        it('inserts a row with ISO Z instants and the writer', async () => {
            const row = await repo.upsertAnchor(getConn(), ownerId, 'a1', ANCHOR, 'bourne');

            expect(row).toMatchObject({ external_id: 'a1', title: 'Stretch', at_minutes: 480, updated_by: 'bourne' });
            expect(row.created_at).toMatch(ISO_Z);
            expect(row.updated_at).toMatch(ISO_Z);
        });

        it('updates by external id and bumps updated_at when a field changed', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await setUpdatedAt(conn, 'rhythm_anchors', ownerId, 'a1', '2020-01-01 00:00:00.000');

            const row = await repo.upsertAnchor(conn, ownerId, 'a1', { ...ANCHOR, at_minutes: 500 }, 'justin');

            expect(row.at_minutes).toBe(500);
            expect(row.updated_by).toBe('justin');
            expect(row.updated_at > '2020-01-01T00:00:00.000Z').toBe(true);
            expect(await repo.listAnchors(conn, ownerId)).toHaveLength(1);
        });

        it('keeps updated_at and updated_by when nothing changed', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await setUpdatedAt(conn, 'rhythm_anchors', ownerId, 'a1', '2020-01-01 00:00:00.000');

            const row = await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'justin');

            expect(row.updated_at).toBe('2020-01-01T00:00:00.000Z');
            expect(row.updated_by).toBe('bourne');
        });

        it('treats a changed description as a change, including to and from null', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await setUpdatedAt(conn, 'rhythm_anchors', ownerId, 'a1', '2020-01-01 00:00:00.000');

            const row = await repo.upsertAnchor(conn, ownerId, 'a1', { ...ANCHOR, description: 'Warm up' }, 'bourne');

            expect(row.description).toBe('Warm up');
            expect(row.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
        });

        it('clears the tombstone for that item only', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'a2', ANCHOR, 'bourne');
            await repo.deleteItem(conn, ownerId, 'anchor', 'a1', 'bourne');
            await repo.deleteItem(conn, ownerId, 'anchor', 'a2', 'bourne');

            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');

            const { deletions } = await repo.changesSince(conn, ownerId, '2000-01-01T00:00:00.000Z');
            expect(deletions.map((d) => d.external_id)).toEqual(['a2']);
        });
    });

    describe('upsertGate', () => {
        it('inserts, then returns instants as ISO Z strings', async () => {
            const row = await repo.upsertGate(getConn(), ownerId, 'g1', GATE, 'bourne');

            expect(row).toMatchObject({ external_id: 'g1', kind: 'plan', state: 'open', hub_url: null });
            expect(row.opens_at).toBe('2026-11-20T09:00:00.000Z');
            expect(row.closes_at).toBe('2026-11-20T10:00:00.000Z');
        });

        it('keeps updated_at when unchanged and bumps it when the state changes', async () => {
            const conn = getConn();
            await repo.upsertGate(conn, ownerId, 'g1', GATE, 'bourne');
            await setUpdatedAt(conn, 'rhythm_gates', ownerId, 'g1', '2020-01-01 00:00:00.000');

            const same = await repo.upsertGate(conn, ownerId, 'g1', GATE, 'bourne');
            expect(same.updated_at).toBe('2020-01-01T00:00:00.000Z');

            const changed = await repo.upsertGate(conn, ownerId, 'g1', { ...GATE, state: 'green' }, 'justin');
            expect(changed.state).toBe('green');
            expect(changed.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
        });

        it('clears the gate tombstone', async () => {
            const conn = getConn();
            await repo.upsertGate(conn, ownerId, 'g1', GATE, 'bourne');
            await repo.deleteItem(conn, ownerId, 'gate', 'g1', 'bourne');
            await repo.upsertGate(conn, ownerId, 'g1', GATE, 'bourne');

            const { deletions } = await repo.changesSince(conn, ownerId, '2000-01-01T00:00:00.000Z');
            expect(deletions).toEqual([]);
        });
    });

    describe('list', () => {
        it('orders anchors by at_minutes then id and gates by opens_at then id, per owner', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'late', { ...ANCHOR, at_minutes: 900 }, 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'early-b', { ...ANCHOR, at_minutes: 60 }, 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'early-a', { ...ANCHOR, at_minutes: 60 }, 'bourne');
            await repo.upsertAnchor(conn, otherId, 'theirs', ANCHOR, 'bourne');
            await repo.upsertGate(conn, ownerId, 'g-late', { ...GATE, opens_at: '2026-11-21 09:00:00.000', closes_at: '2026-11-21 10:00:00.000' }, 'bourne');
            await repo.upsertGate(conn, ownerId, 'g-early', GATE, 'bourne');
            await repo.upsertGate(conn, otherId, 'g-theirs', GATE, 'bourne');

            expect((await repo.listAnchors(conn, ownerId)).map((r) => r.external_id)).toEqual([
                'early-b',
                'early-a',
                'late',
            ]);
            expect((await repo.listGates(conn, ownerId)).map((r) => r.external_id)).toEqual(['g-early', 'g-late']);
        });
    });

    describe('patchAnchor', () => {
        it('changes only the given fields and records justin', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', { ...ANCHOR, description: 'Keep' }, 'bourne');

            const row = await repo.patchAnchor(conn, ownerId, 'a1', { at_minutes: 600, enabled: 0 });

            expect(row).toMatchObject({ at_minutes: 600, enabled: 0, weekdays: 127, description: 'Keep', title: 'Stretch', updated_by: 'justin' });
        });

        it('returns null for an unknown id or another owner\'s anchor', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, otherId, 'a1', ANCHOR, 'bourne');

            expect(await repo.patchAnchor(conn, ownerId, 'a1', { enabled: 0 })).toBeNull();
            expect(await repo.patchAnchor(conn, ownerId, 'nope', { enabled: 0 })).toBeNull();
        });
    });

    describe('deleteItem', () => {
        it('removes the row, records a tombstone and reports true', async () => {
            const conn = getConn();
            await repo.upsertGate(conn, ownerId, 'g1', GATE, 'bourne');

            expect(await repo.deleteItem(conn, ownerId, 'gate', 'g1', 'justin')).toBe(true);

            expect(await repo.listGates(conn, ownerId)).toEqual([]);
            const { deletions } = await repo.changesSince(conn, ownerId, '2000-01-01T00:00:00.000Z');
            expect(deletions).toEqual([
                { item_kind: 'gate', external_id: 'g1', deleted_at: expect.stringMatching(ISO_Z), deleted_by: 'justin' },
            ]);
        });

        it('returns false and records nothing for an unknown id or another owner\'s item', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, otherId, 'a1', ANCHOR, 'bourne');

            expect(await repo.deleteItem(conn, ownerId, 'anchor', 'a1', 'justin')).toBe(false);
            expect(await repo.deleteItem(conn, ownerId, 'anchor', 'zzz', 'justin')).toBe(false);

            const { deletions } = await repo.changesSince(conn, ownerId, '2000-01-01T00:00:00.000Z');
            expect(deletions).toEqual([]);
            expect(await repo.listAnchors(conn, otherId)).toHaveLength(1);
        });

        it('prunes this owner\'s tombstones older than 30 days on delete', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'old', ANCHOR, 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'recent', ANCHOR, 'bourne');
            await repo.deleteItem(conn, ownerId, 'anchor', 'old', 'bourne');
            await conn.execute(
                "UPDATE rhythm_deletions SET deleted_at = UTC_TIMESTAMP(3) - INTERVAL 31 DAY WHERE owner_id = ? AND external_id = 'old'",
                [ownerId]
            );

            await repo.deleteItem(conn, ownerId, 'anchor', 'recent', 'bourne');

            const { deletions } = await repo.changesSince(conn, ownerId, '2000-01-01T00:00:00.000Z');
            expect(deletions.map((d) => d.external_id)).toEqual(['recent']);
        });

        it('keeps a tombstone that is 29 days old', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'a2', ANCHOR, 'bourne');
            await repo.deleteItem(conn, ownerId, 'anchor', 'a1', 'bourne');
            await conn.execute(
                "UPDATE rhythm_deletions SET deleted_at = UTC_TIMESTAMP(3) - INTERVAL 29 DAY WHERE owner_id = ? AND external_id = 'a1'",
                [ownerId]
            );

            await repo.deleteItem(conn, ownerId, 'anchor', 'a2', 'bourne');

            const { deletions } = await repo.changesSince(conn, ownerId, '2000-01-01T00:00:00.000Z');
            expect(deletions.map((d) => d.external_id).sort()).toEqual(['a1', 'a2']);
        });

        it('re-deleting after re-creating refreshes the single tombstone', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await repo.deleteItem(conn, ownerId, 'anchor', 'a1', 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await repo.deleteItem(conn, ownerId, 'anchor', 'a1', 'justin');

            const { deletions } = await repo.changesSince(conn, ownerId, '2000-01-01T00:00:00.000Z');
            expect(deletions).toHaveLength(1);
            expect(deletions[0].deleted_by).toBe('justin');
        });
    });

    describe('changesSince', () => {
        it('returns a UTC cursor and only rows changed after since, for that owner', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'old-a', ANCHOR, 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'new-a', ANCHOR, 'bourne');
            await repo.upsertGate(conn, ownerId, 'old-g', GATE, 'bourne');
            await repo.upsertGate(conn, ownerId, 'new-g', GATE, 'bourne');
            await repo.upsertAnchor(conn, otherId, 'theirs', ANCHOR, 'bourne');
            await repo.upsertAnchor(conn, ownerId, 'gone', ANCHOR, 'bourne');
            await repo.deleteItem(conn, ownerId, 'anchor', 'gone', 'bourne');
            await setUpdatedAt(conn, 'rhythm_anchors', ownerId, 'old-a', '2020-01-01 00:00:00.000');
            await setUpdatedAt(conn, 'rhythm_gates', ownerId, 'old-g', '2020-01-01 00:00:00.000');

            const result = await repo.changesSince(conn, ownerId, '2021-01-01T00:00:00.000Z');

            expect(result.cursor).toMatch(ISO_Z);
            expect(result.anchors.map((r) => r.external_id)).toEqual(['new-a']);
            expect(result.gates.map((r) => r.external_id)).toEqual(['new-g']);
            expect(result.deletions.map((d) => d.external_id)).toEqual(['gone']);
        });

        it('excludes rows at exactly since and uses a cursor not before the changes', async () => {
            const conn = getConn();
            await repo.upsertAnchor(conn, ownerId, 'a1', ANCHOR, 'bourne');
            await setUpdatedAt(conn, 'rhythm_anchors', ownerId, 'a1', '2021-01-01 00:00:00.000');

            const result = await repo.changesSince(conn, ownerId, '2021-01-01T00:00:00.000Z');

            expect(result.anchors).toEqual([]);
            expect(result.cursor > '2021-01-01T00:00:00.000Z').toBe(true);
        });
    });
});
