'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/projectThoughtsRepo');

const getConn = useTransaction();

const createProject = async (conn) => {
    const ownerId = await createTestUser(conn);
    const [result] = await conn.execute(
        'INSERT INTO projects (owner_id, title) VALUES (?, ?)',
        [ownerId, 'p']
    );

    return result.insertId;
};

describe('projectThoughtsRepo', () => {
    it('findByProject and findForUpdate return null for a project with no thoughts', async () => {
        const conn = getConn();
        const projectId = await createProject(conn);

        expect(await repo.findByProject(conn, projectId)).toBeNull();
        expect(await repo.findForUpdate(conn, projectId)).toBeNull();
    });

    it('save creates the row at version 1, then each save replaces text and adds 1', async () => {
        const conn = getConn();
        const projectId = await createProject(conn);

        const first = await repo.save(conn, projectId, 'one');
        expect(first).toMatchObject({ project_id: projectId, text: 'one', version: 1 });
        expect(first.updated_at).toBeInstanceOf(Date);

        const second = await repo.save(conn, projectId, 'two');
        expect(second).toMatchObject({ project_id: projectId, text: 'two', version: 2 });
        expect(await repo.findByProject(conn, projectId)).toEqual(second);
        expect(await repo.findForUpdate(conn, projectId)).toEqual(second);

        expect((await repo.save(conn, projectId, '')).version).toBe(3);
    });

    it('keeps each project\'s thoughts separate', async () => {
        const conn = getConn();
        const a = await createProject(conn);
        const b = await createProject(conn);

        await repo.save(conn, a, 'a');
        await repo.save(conn, a, 'a2');

        expect(await repo.findByProject(conn, b)).toBeNull();
        expect((await repo.save(conn, b, 'b')).version).toBe(1);
    });

    it('deleting the project deletes its thoughts row', async () => {
        const conn = getConn();
        const projectId = await createProject(conn);
        await repo.save(conn, projectId, 'x');

        await conn.execute('DELETE FROM projects WHERE id = ?', [projectId]);

        expect(await repo.findByProject(conn, projectId)).toBeNull();
    });
});
