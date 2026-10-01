'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { bindConnection } = require('../../src/db/unitOfWork');
const { authHeaderFor } = require('../helpers/auth');
const { createTestUser, useTransaction } = require('../helpers/db');

const getConn = useTransaction();

const listProjects = (ownerId, query = '') =>
    request(app).get(`/api/projects${query}`).set('Authorization', authHeaderFor(ownerId));

const countStatements = async (conn, fn) => {
    const counter = { statements: 0 };
    const proxy = {
        execute: (...args) => {
            counter.statements += 1;
            return conn.execute(...args);
        },
        query: (...args) => {
            counter.statements += 1;
            return conn.query(...args);
        },
    };

    bindConnection(proxy);
    try {
        const result = await fn();
        return { result, statements: counter.statements };
    } finally {
        bindConnection(conn);
    }
};

const createPinnedSequenceProject = async (conn, ownerId, title) => {
    const project = await projectsRepo.create(conn, { ownerId, title });
    const layer = await layersRepo.create(conn, { projectId: project.id });
    const sequence = await sequencesRepo.create(conn, { layerId: layer.id, title: `${title} seq` });
    await sequencesRepo.setPinned(conn, [sequence.id], true);
    await todosRepo.create(conn, { projectId: project.id, sequenceId: sequence.id, text: 'a' });

    return { project, sequence };
};

describe('GET /api/projects?include=pinnedSequences', () => {
    test('returns pinned sequences in layer then sequence order with narrow shape', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'Launch' });
        const firstLayer = await layersRepo.create(conn, { projectId: project.id });
        const secondLayer = await layersRepo.create(conn, { projectId: project.id });
        const late = await sequencesRepo.create(conn, { layerId: secondLayer.id, title: 'Late' });
        const second = await sequencesRepo.create(conn, {
            layerId: firstLayer.id,
            title: 'Second',
            description: 'desc',
        });
        const first = await sequencesRepo.create(conn, { layerId: firstLayer.id, title: 'First' });
        await sequencesRepo.move(conn, first.id, { layerId: firstLayer.id, position: 0 });
        const unpinned = await sequencesRepo.create(conn, { layerId: firstLayer.id, title: 'No' });
        await sequencesRepo.setPinned(conn, [late.id, second.id, first.id], true);
        const t1 = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: second.id,
            text: 'one',
        });
        const t2 = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: second.id,
            text: 'two',
        });
        await todosRepo.update(conn, t2.id, { status: 'complete' });
        await todosRepo.setPinned(conn, [t2.id], true);
        const empty = await projectsRepo.create(conn, { ownerId, title: 'Empty' });

        // Act
        const response = await listProjects(ownerId, '?include=pinnedSequences');

        // Assert
        expect(response.status).toBe(200);
        const byId = Object.fromEntries(response.body.data.map((p) => [p.id, p]));
        expect(byId[empty.id].pinnedSequences).toEqual([]);
        const pinned = byId[project.id].pinnedSequences;
        expect(pinned.map((s) => s.title)).toEqual(['First', 'Second', 'Late']);
        expect(pinned.map((s) => s.id)).not.toContain(unpinned.id);
        expect(pinned[1]).toEqual({
            id: second.id,
            title: 'Second',
            description: 'desc',
            isBlocked: false,
            isPinned: true,
            layerId: firstLayer.id,
            position: pinned[1].position,
            todos: [
                { id: t1.id, text: 'one', status: 'incomplete', isPinned: false, position: 0 },
                { id: t2.id, text: 'two', status: 'complete', isPinned: true, position: 1 },
            ],
        });
        expect(pinned[0].todos).toEqual([]);
    });

    test('plain GET leaves the payload and statement count unchanged', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await createPinnedSequenceProject(conn, ownerId, 'A');

        // Act
        const { result, statements } = await countStatements(conn, () => listProjects(ownerId));

        // Assert
        expect(statements).toBe(2);
        expect(result.body.data[0]).not.toHaveProperty('pinnedSequences');
    });

    test('runs the same number of statements for one project or many', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await createPinnedSequenceProject(conn, ownerId, 'A');
        const one = await countStatements(conn, () =>
            listProjects(ownerId, '?include=pinnedSequences')
        );
        await createPinnedSequenceProject(conn, ownerId, 'B');
        await createPinnedSequenceProject(conn, ownerId, 'C');

        // Act
        const many = await countStatements(conn, () =>
            listProjects(ownerId, '?include=pinnedSequences')
        );

        // Assert
        expect(one.statements).toBe(4);
        expect(many.statements).toBe(one.statements);
        expect(many.result.body.data.every((p) => p.pinnedSequences.length === 1)).toBe(true);
    });

    test('does not leak another owner pinned sequences', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await createPinnedSequenceProject(conn, otherId, 'Theirs');
        await projectsRepo.create(conn, { ownerId, title: 'Mine' });

        // Act
        const response = await listProjects(ownerId, '?include=pinnedSequences');

        // Assert
        expect(response.body.data.map((p) => p.pinnedSequences)).toEqual([[]]);
    });
});
