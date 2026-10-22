'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { useTransaction, createTestUser } = require('../helpers/db');
const layersRepo = require('../../src/db/repositories/layersRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const remindersRepo = require('../../src/db/repositories/remindersRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { runSetup } = require('../../scripts/setupReminders');

const getConn = useTransaction();

// 2026-10-22 is a Thursday.
const NOW = new Date('2026-10-22T12:00:00Z');
const TIME_ZONE = 'America/Los_Angeles';

const seed = async (conn) => {
    const ownerId = await createTestUser(conn);
    const home = await placesRepo.create(conn, { ownerId, name: 'Home', kind: 'home' });
    await placesRepo.create(conn, { ownerId, name: 'seagate' });
    const project = await projectsRepo.create(conn, { ownerId, title: 'Setup' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'L' });
    const sequence = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Errands' });
    const open = await todosRepo.create(conn, { projectId: project.id, text: 'Call on Mon', sequenceId: sequence.id });
    const blocked = await todosRepo.create(conn, { projectId: project.id, text: 'Wait for parts', sequenceId: sequence.id });
    const done = await todosRepo.create(conn, { projectId: project.id, text: 'Already done', sequenceId: sequence.id });
    await todosRepo.update(conn, open.id, { placeId: home.id });
    await todosRepo.update(conn, blocked.id, { status: 'blocked' });
    await todosRepo.update(conn, done.id, { status: 'complete' });
    return { ownerId, home, project, open, blocked };
};

const countRows = async (conn, table, where, params) => {
    const [rows] = await conn.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params);
    return rows[0].n;
};

const tmpBackup = () => path.join(os.tmpdir(), `setup-reminders-${Date.now()}-${Math.random()}.json`);

describe('runSetup', () => {
    it('returns the plan on a dry run and writes nothing', async () => {
        const conn = getConn();
        const { ownerId, project, open, blocked, home } = await seed(conn);

        const plan = await runSetup({ projectId: project.id, apply: false, now: NOW, timeZone: TIME_ZONE });

        expect(plan.placesToCreate.map((p) => p.name)).toEqual([
            'Leemac', 'Church', 'Western Digital', 'Bloom shipping', 'Bloom HQ',
        ]);
        expect(plan.remindersToCreate).toEqual([
            { todoId: open.id, title: 'Call on Mon', placeId: home.id, dueDate: '2026-10-26' },
            { todoId: blocked.id, title: 'Wait for parts', placeId: null, dueDate: null },
        ]);
        expect(plan.projectToDelete).toEqual({ id: project.id, title: 'Setup' });
        expect(await countRows(conn, 'places', 'owner_id = ?', [ownerId])).toBe(2);
        expect(await countRows(conn, 'reminders', 'owner_id = ?', [ownerId])).toBe(0);
        expect(await projectsRepo.findById(conn, project.id)).toBeTruthy();
    });

    it('backs up, creates places and reminders, and deletes the project on apply', async () => {
        const conn = getConn();
        const { ownerId, project, home } = await seed(conn);
        const backupPath = tmpBackup();

        await runSetup({ projectId: project.id, apply: true, backupPath, now: NOW, timeZone: TIME_ZONE });

        const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        fs.unlinkSync(backupPath);
        expect(backup.project.title).toBe('Setup');
        expect(backup.sequences.map((s) => s.title)).toEqual(['Errands']);
        expect(backup.todos.map((t) => t.text).sort()).toEqual(['Already done', 'Call on Mon', 'Wait for parts']);

        expect(await countRows(conn, 'places', 'owner_id = ?', [ownerId])).toBe(7);
        expect(await projectsRepo.findById(conn, project.id)).toBeFalsy();

        const reminders = await remindersRepo.listByOwner(conn, ownerId, { sort: 'created' });
        expect(reminders).toHaveLength(2);
        const call = reminders.find((r) => r.title === 'Call on Mon');
        expect(call).toMatchObject({
            owner_id: ownerId,
            place_id: home.id,
            time_zone: TIME_ZONE,
            todo_id: null,
            project_id: null,
        });
        expect(call.due_date).toBeTruthy();
    });

    it('throws before writing when apply has no backupPath', async () => {
        const conn = getConn();
        const { ownerId, project } = await seed(conn);

        await expect(
            runSetup({ projectId: project.id, apply: true, now: NOW, timeZone: TIME_ZONE })
        ).rejects.toThrow(/backup/i);

        expect(await projectsRepo.findById(conn, project.id)).toBeTruthy();
        expect(await countRows(conn, 'places', 'owner_id = ?', [ownerId])).toBe(2);
    });

    it('throws when the project does not exist', async () => {
        await expect(
            runSetup({ projectId: 2147483000, apply: false, now: NOW, timeZone: TIME_ZONE })
        ).rejects.toThrow(/not found/i);
    });
});
