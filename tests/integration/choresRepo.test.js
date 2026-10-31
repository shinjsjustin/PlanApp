'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const choresRepo = require('../../src/db/repositories/choresRepo');
const logsRepo = require('../../src/db/repositories/choreLogsRepo');
const assertOwnership = require('../../src/middleware/assertOwnership');

const getConn = useTransaction();

const newChore = (conn, ownerId, name = 'Vacuum') =>
    choresRepo.create(conn, { ownerId, name, windowMin: 3, windowMax: 7 });

describe('choresRepo', () => {
    it('create applies defaults; findById returns it or null', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const created = await newChore(conn, ownerId);

        expect(created).toMatchObject({
            owner_id: ownerId, name: 'Vacuum', area: null, window_min: 3, window_max: 7,
            notes: null, archived_at: null, last_done_on: null, last_done_by: null,
        });
        expect(await choresRepo.findById(conn, created.id)).toEqual(created);
        expect(await choresRepo.findById(conn, 0)).toBeNull();
    });

    it('rows carry the latest log, ties on done_on going to the highest id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await newChore(conn, ownerId);
        await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-20', doneBy: 'Ann' });
        await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-25', doneBy: 'Bob' });
        await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-25', doneBy: 'Cy' });
        await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-10', doneBy: 'Dee' });

        const found = await choresRepo.findById(conn, chore.id);
        const [listed] = await choresRepo.listByOwner(conn, ownerId, { archived: false });

        expect(found).toMatchObject({ last_done_on: '2026-10-25', last_done_by: 'Cy' });
        expect(listed).toMatchObject({ last_done_on: '2026-10-25', last_done_by: 'Cy' });
    });

    it('listByOwner filters archived and active chores of one owner only', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const active = await newChore(conn, ownerId, 'Active');
        const old = await newChore(conn, ownerId, 'Old');
        await newChore(conn, otherId, 'Theirs');
        const archived = await choresRepo.setArchived(conn, old.id, true);

        expect(archived.archived_at).not.toBeNull();
        expect((await choresRepo.listByOwner(conn, ownerId, { archived: false })).map((r) => r.id)).toEqual([active.id]);
        expect((await choresRepo.listByOwner(conn, ownerId, { archived: true })).map((r) => r.id)).toEqual([old.id]);

        const restored = await choresRepo.setArchived(conn, old.id, false);
        expect(restored.archived_at).toBeNull();
    });

    it('update changes named fields and returns null for a missing chore', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await newChore(conn, ownerId);

        const updated = await choresRepo.update(conn, chore.id, { name: 'Mop', area: 'Kitchen', windowMax: 9, notes: 'x' });

        expect(updated).toMatchObject({ name: 'Mop', area: 'Kitchen', window_min: 3, window_max: 9, notes: 'x' });
        expect(await choresRepo.update(conn, 0, { name: 'Nope' })).toBeNull();
    });

    it('listNamesByOwner returns every name of the owner, archived included', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await newChore(conn, ownerId, 'A');
        const b = await newChore(conn, ownerId, 'B');
        await newChore(conn, otherId, 'C');
        await choresRepo.setArchived(conn, b.id, true);

        expect((await choresRepo.listNamesByOwner(conn, ownerId)).sort()).toEqual(['A', 'B']);
    });

    it('rejects a duplicate name for one owner', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await newChore(conn, ownerId);

        await expect(newChore(conn, ownerId)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    });
});

describe('choreLogsRepo', () => {
    it('create and findById return the log with a formatted date, or null', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await newChore(conn, ownerId);

        const log = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-20', doneBy: 'Ann' });

        expect(log).toMatchObject({ chore_id: chore.id, done_on: '2026-10-20', done_by: 'Ann' });
        expect(await logsRepo.findById(conn, log.id)).toEqual(log);
        expect(await logsRepo.findById(conn, 0)).toBeNull();
    });

    it('listByChore returns newest first by done_on then id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await newChore(conn, ownerId);
        const other = await newChore(conn, ownerId, 'Other');
        const a = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-20', doneBy: 'A' });
        const b = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-25', doneBy: 'B' });
        const c = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-25', doneBy: 'C' });
        await logsRepo.create(conn, { choreId: other.id, doneOn: '2026-10-30', doneBy: 'Z' });

        expect((await logsRepo.listByChore(conn, chore.id)).map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    });

    it('update changes fields (null when missing) and remove deletes', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await newChore(conn, ownerId);
        const log = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-20', doneBy: 'A' });

        const updated = await logsRepo.update(conn, log.id, { doneOn: '2026-10-21', doneBy: 'B' });
        expect(updated).toMatchObject({ done_on: '2026-10-21', done_by: 'B' });
        expect(await logsRepo.update(conn, 0, { doneBy: 'x' })).toBeNull();

        expect(await logsRepo.remove(conn, log.id)).toBe(true);
        expect(await logsRepo.remove(conn, log.id)).toBe(false);
        expect((await choresRepo.findById(conn, chore.id)).last_done_on).toBeNull();
    });
});

describe('assertOwnership for chores', () => {
    it('chore is owned directly and choreLog through its chore', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const chore = await newChore(conn, ownerId);
        const log = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-10-20', doneBy: 'A' });

        expect(await assertOwnership(conn, 'chore', chore.id, ownerId)).toMatchObject({ id: chore.id, owner_id: ownerId });
        expect(await assertOwnership(conn, 'choreLog', log.id, ownerId)).toMatchObject({ id: chore.id, owner_id: ownerId });
        await expect(assertOwnership(conn, 'chore', chore.id, otherId)).rejects.toMatchObject({ status: 403 });
        await expect(assertOwnership(conn, 'choreLog', log.id, otherId)).rejects.toMatchObject({ status: 403 });
        await expect(assertOwnership(conn, 'chore', 0, ownerId)).rejects.toMatchObject({ status: 404 });
        await expect(assertOwnership(conn, 'choreLog', 0, ownerId)).rejects.toMatchObject({ status: 404 });
    });
});
