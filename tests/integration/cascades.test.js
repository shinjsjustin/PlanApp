'use strict';

const todosRepo = require('../../src/db/repositories/todosRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * The referential rules from spec section 4.2, asserted against the real schema
 * rather than against repository logic: a to-do outlives the sequence it was
 * filed in, and a project takes every child row with it.
 */

const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const upperLayer = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const lowerLayer = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
    const parent = await sequencesRepo.create(conn, { layerId: upperLayer.id, title: 'Parent' });
    const child = await sequencesRepo.create(conn, { layerId: lowerLayer.id, title: 'Child' });

    return { ownerId, project, upperLayer, lowerLayer, parent, child };
};

const countIn = async (conn, table, projectId) => {
    const [rows] = await conn.execute(
        `SELECT COUNT(*) AS total FROM \`${table}\` WHERE project_id = ?`,
        [projectId]
    );

    return rows[0].total;
};

describe('deleting a sequence', () => {
    test('sets its to-dos sequence_id to NULL instead of deleting them', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent } = await createFixture(conn);
        const filed = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: parent.id,
            text: 'Lift and drag',
        });

        // Act
        await sequencesRepo.remove(conn, parent.id);

        // Assert
        const survivor = await todosRepo.findById(conn, filed.id);
        expect(survivor).not.toBeNull();
        expect(survivor.sequence_id).toBeNull();
        expect(survivor.text).toBe('Lift and drag');
    });

    test('returns its to-dos to the end of the unorganized list, densely positioned', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent } = await createFixture(conn);
        const loose = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        const filedFirst = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: parent.id,
            text: 'Filed first',
        });
        const filedSecond = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: parent.id,
            text: 'Filed second',
        });

        // Act
        await sequencesRepo.remove(conn, parent.id);

        // Assert
        const unorganized = await todosRepo.listUnorganized(conn, project.id);
        expect(unorganized.map((t) => t.id)).toEqual([loose.id, filedFirst.id, filedSecond.id]);
        expect(unorganized.map((t) => t.position)).toEqual([0, 1, 2]);
    });
});

describe('deleting a project', () => {
    test('cascades to every child table', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: parent.id,
            text: 'Filed',
        });

        // Act
        const removed = await projectsRepo.remove(conn, project.id);

        // Assert
        expect(removed).toBe(true);
        expect(await countIn(conn, 'layers', project.id)).toBe(0);
        expect(await countIn(conn, 'sequences', project.id)).toBe(0);
        expect(await countIn(conn, 'todos', project.id)).toBe(0);
    });

    test('leaves other projects untouched', async () => {
        // Arrange
        const conn = getConn();
        const doomed = await createFixture(conn);
        const survivor = await createFixture(conn);
        await todosRepo.create(conn, { projectId: survivor.project.id, text: 'Still here' });

        // Act
        await projectsRepo.remove(conn, doomed.project.id);

        // Assert
        expect(await countIn(conn, 'layers', survivor.project.id)).toBe(2);
        expect(await countIn(conn, 'sequences', survivor.project.id)).toBe(2);
        expect(await countIn(conn, 'todos', survivor.project.id)).toBe(1);
    });
});
