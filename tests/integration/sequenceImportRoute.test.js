'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture, unorganizedOrder, sequenceOrder } = require('../helpers/todosFixture');

const getConn = useTransaction();

const SCHEMA = ['- loose one', '- loose two', '### First', '- a', '- b', '### Second', '- c'].join('\n');

const requestImport = (userId, layerId, body) =>
    request(app)
        .post(`/api/layers/${layerId}/sequences/import`)
        .set('Authorization', authHeaderFor(userId))
        .send(body);

const counts = async (conn, projectId) => [
    (await sequencesRepo.listByProject(conn, projectId)).length,
    (await todosRepo.listByProject(conn, projectId)).length,
];

describe('POST /api/layers/:id/sequences/import', () => {
    test('appends sequences after the existing one with their todos', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        // Act
        const response = await requestImport(ownerId, layer.id, { schema: SCHEMA });

        // Assert
        expect(response.status).toBe(201);
        const { sequences, todos } = response.body.data;
        expect(sequences.map((s) => [s.title, s.position, s.layerId])).toEqual([
            ['First', 1, layer.id],
            ['Second', 2, layer.id],
        ]);
        expect(todos.map((t) => t.text)).toEqual(['a', 'b', 'c', 'loose one', 'loose two']);
        expect(await sequenceOrder(conn, sequences[0].id)).toEqual([['a', 0], ['b', 1]]);
        expect(await sequenceOrder(conn, sequences[1].id)).toEqual([['c', 0]]);
    });

    test('accepts a leading ## line and keeps the layer title', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        // Act
        const response = await requestImport(ownerId, layer.id, { schema: `## Renamed\n${SCHEMA}` });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data.sequences).toHaveLength(2);
        expect((await layersRepo.findById(conn, layer.id)).title).toBe('Learning');
    });

    test('appends loose todos after existing Unorganized todos', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'Existing' });

        // Act
        const response = await requestImport(ownerId, layer.id, { schema: SCHEMA });

        // Assert
        expect(response.status).toBe(201);
        expect(await unorganizedOrder(conn, project.id)).toEqual([
            ['Existing', 0],
            ['loose one', 1],
            ['loose two', 2],
        ]);
    });

    test('answers 403 for another user\'s layer and writes nothing', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createFixture(conn);
        const theirs = await createFixture(conn);

        // Act
        const response = await requestImport(mine.ownerId, theirs.layer.id, { schema: SCHEMA });

        // Assert
        expect(response.status).toBe(403);
        expect(await counts(conn, theirs.project.id)).toEqual([1, 0]);
    });

    test('answers 400 with the line message and creates nothing for a late bad line', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        const bad = ['### First', '- a', '- b', 'oops', '- c'].join('\n');

        // Act
        const response = await requestImport(ownerId, layer.id, { schema: bad });

        // Assert
        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).toContain('line 4');
        expect(await counts(conn, project.id)).toEqual([1, 0]);
    });
});
