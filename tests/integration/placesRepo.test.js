'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/placesRepo');
const assertOwnership = require('../../src/middleware/assertOwnership');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');

const getConn = useTransaction();

const defaultFlags = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        'SELECT name, is_default_start FROM places WHERE owner_id = ? ORDER BY id',
        [ownerId]
    );
    return rows.map((r) => [r.name, r.is_default_start]);
};

describe('placesRepo', () => {
    it('create returns the row with defaults and findById returns it, or null when missing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const created = await repo.create(conn, { ownerId, name: 'Home', address: '1 Main St' });

        expect(created).toMatchObject({
            owner_id: ownerId,
            name: 'Home',
            address: '1 Main St',
            kind: 'other',
            notes: null,
            visit_minutes: null,
            is_default_start: 0,
        });
        expect(await repo.findById(conn, created.id)).toEqual(created);
        expect(await repo.findById(conn, 0)).toBeNull();
    });

    it('create stores kind, notes and visit_minutes when given', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const created = await repo.create(conn, {
            ownerId, name: 'Acme', address: '2 Elm', kind: 'client', notes: 'ring bell', visitMinutes: 90,
        });

        expect(created).toMatchObject({ kind: 'client', notes: 'ring bell', visit_minutes: 90 });
    });

    it('listByOwner returns only that owner\'s places by name with id as tie-break', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await repo.create(conn, { ownerId, name: 'Zed', address: 'a' });
        await repo.create(conn, { ownerId, name: 'Alpha', address: 'a' });
        await repo.create(conn, { ownerId, name: 'Alpha', address: 'b' });
        await repo.create(conn, { ownerId: otherId, name: 'Aardvark', address: 'a' });

        const rows = await repo.listByOwner(conn, ownerId);

        expect(rows.map((r) => [r.name, r.address])).toEqual([
            ['Alpha', 'a'], ['Alpha', 'b'], ['Zed', 'a'],
        ]);
    });

    it('update changes only the given fields and returns null for a missing id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, name: 'Old', address: 'x', kind: 'work' });

        const updated = await repo.update(conn, created.id, { name: 'New', visitMinutes: 60 });

        expect(updated).toMatchObject({ name: 'New', address: 'x', kind: 'work', visit_minutes: 60 });
        expect(await repo.update(conn, 0, { name: 'n' })).toBeNull();
    });

    it('remove returns true for a deleted row and false for a missing one', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, name: 'Gone', address: 'x' });

        expect(await repo.remove(conn, created.id)).toBe(true);
        expect(await repo.findById(conn, created.id)).toBeNull();
        expect(await repo.remove(conn, created.id)).toBe(false);
    });

    it('setDefaultStart keeps at most one default per owner, and null clears it', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const a = await repo.create(conn, { ownerId, name: 'A', address: 'x' });
        const b = await repo.create(conn, { ownerId, name: 'B', address: 'x' });
        const theirs = await repo.create(conn, { ownerId: otherId, name: 'T', address: 'x' });
        await repo.setDefaultStart(conn, otherId, theirs.id);

        await repo.setDefaultStart(conn, ownerId, a.id);
        await repo.setDefaultStart(conn, ownerId, b.id);

        expect(await defaultFlags(conn, ownerId)).toEqual([['A', 0], ['B', 1]]);
        expect(await defaultFlags(conn, otherId)).toEqual([['T', 1]]);

        await repo.setDefaultStart(conn, ownerId, null);

        expect(await defaultFlags(conn, ownerId)).toEqual([['A', 0], ['B', 0]]);
    });

    it('setDefaultStart ignores a place owned by someone else', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const mine = await repo.create(conn, { ownerId, name: 'Mine', address: 'x' });
        const theirs = await repo.create(conn, { ownerId: otherId, name: 'Theirs', address: 'x' });
        await repo.setDefaultStart(conn, ownerId, mine.id);

        await repo.setDefaultStart(conn, ownerId, theirs.id);

        expect(await defaultFlags(conn, otherId)).toEqual([['Theirs', 0]]);
    });

    it('deleting a place nulls place_id on to-dos and sequences that pointed at it', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const layer = await layersRepo.create(conn, { projectId: project.id, title: 'L' });
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id, title: 'S' });
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'T' });
        const place = await repo.create(conn, { ownerId, name: 'Pl', address: 'x' });
        await conn.execute('UPDATE todos SET place_id = ? WHERE id = ?', [place.id, todo.id]);
        await conn.execute('UPDATE sequences SET place_id = ? WHERE id = ?', [place.id, sequence.id]);

        await repo.remove(conn, place.id);

        const [[t]] = await conn.execute('SELECT place_id FROM todos WHERE id = ?', [todo.id]);
        const [[s]] = await conn.execute('SELECT place_id FROM sequences WHERE id = ?', [sequence.id]);
        expect(t.place_id).toBeNull();
        expect(s.place_id).toBeNull();
    });

    it('assertOwnership place returns the place for its owner and forbids a stranger', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await repo.create(conn, { ownerId, name: 'Mine', address: 'x' });

        const owned = await assertOwnership(conn, 'place', place.id, ownerId);

        expect(owned).toMatchObject({ id: place.id, owner_id: ownerId });
        await expect(assertOwnership(conn, 'place', place.id, strangerId)).rejects.toMatchObject({
            status: 403,
        });
    });
});
