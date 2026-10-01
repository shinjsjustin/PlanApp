'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture, unorganizedOrder, sequenceOrder } = require('../helpers/todosFixture');

const getConn = useTransaction();

const SCHEMA = ['## Build', '', '- loose one', '- loose two', '### First', '- a', '- b', '### Second', '- c'].join('\n');

const requestImport = (userId, projectId, body) =>
    request(app)
        .post(`/api/projects/${projectId}/layers/import`)
        .set('Authorization', authHeaderFor(userId))
        .send(body);

const counts = async (conn, projectId) => [
    (await layersRepo.listByProject(conn, projectId)).length,
    (await sequencesRepo.listByProject(conn, projectId)).length,
    (await todosRepo.listByProject(conn, projectId)).length,
];

describe('POST /api/projects/:id/layers/import', () => {
    test('appends the layer with its sequences and todos in order', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);

        // Act
        const response = await requestImport(ownerId, project.id, { schema: SCHEMA });

        // Assert
        expect(response.status).toBe(201);
        const { layer: created, sequences, todos } = response.body.data;
        expect(created.title).toBe('Build');
        expect(created.position).toBe(1);
        expect(sequences.map((s) => [s.title, s.position, s.layerId])).toEqual([
            ['First', 0, created.id],
            ['Second', 1, created.id],
        ]);
        expect(todos.map((t) => t.text)).toEqual(['a', 'b', 'c', 'loose one', 'loose two']);
        expect(todos.every((t) => t.status === 'incomplete' && t.isPinned === false)).toBe(true);
        expect(await sequenceOrder(conn, sequences[0].id)).toEqual([['a', 0], ['b', 1]]);
        expect(await sequenceOrder(conn, sequences[1].id)).toEqual([['c', 0]]);
    });

    test('appends loose todos after existing Unorganized todos', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'Existing' });

        // Act
        const response = await requestImport(ownerId, project.id, { schema: SCHEMA });

        // Assert
        expect(response.status).toBe(201);
        expect(await unorganizedOrder(conn, project.id)).toEqual([
            ['Existing', 0],
            ['loose one', 1],
            ['loose two', 2],
        ]);
    });

    test('inserts directly below afterLayerId', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        await layersRepo.create(conn, { projectId: project.id, title: 'Last' });

        // Act
        const response = await requestImport(ownerId, project.id, {
            schema: SCHEMA,
            afterLayerId: layer.id,
        });

        // Assert
        expect(response.status).toBe(201);
        const layers = await layersRepo.listByProject(conn, project.id);
        expect(layers.map((l) => l.title)).toEqual(['Learning', 'Build', 'Last']);
    });

    test('answers 400 for an afterLayerId from another project of the same user', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const other = await projectsRepo.create(conn, { ownerId, title: 'Other' });
        const foreign = await layersRepo.create(conn, { projectId: other.id, title: 'Foreign' });

        // Act
        const response = await requestImport(ownerId, project.id, {
            schema: SCHEMA,
            afterLayerId: foreign.id,
        });

        // Assert
        expect(response.status).toBe(400);
        expect(await counts(conn, project.id)).toEqual([1, 1, 0]);
    });

    test('answers 403 for another user\'s project and writes nothing', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createFixture(conn);
        const theirs = await createFixture(conn);

        // Act
        const response = await requestImport(mine.ownerId, theirs.project.id, { schema: SCHEMA });

        // Assert
        expect(response.status).toBe(403);
        expect(await counts(conn, theirs.project.id)).toEqual([1, 1, 0]);
    });

    test('answers 400 with the line message and leaves the project unchanged', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const bad = ['## Build', '### First', '- a', '- b', 'oops', '- c'].join('\n');

        // Act
        const response = await requestImport(ownerId, project.id, { schema: bad });

        // Assert
        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).toContain('line 5');
        expect(await counts(conn, project.id)).toEqual([1, 1, 0]);
    });
});
