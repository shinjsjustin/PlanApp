'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * `PUT /api/todos/:id/move` — the one endpoint that places a to-do (spec 4.4).
 *
 * It gets a file of its own because it carries the weight of spec section 4.2:
 * `sequence_id IS NULL` is the unorganized panel, not a missing value. That makes
 * the panel an ordered list like any other, so filing a to-do into a sequence,
 * reordering it there, and sending it back out are all "put this to-do at this
 * position in this list" — one endpoint, not three.
 *
 * Every case checks both lists the move touches, because the danger is not the
 * to-do landing in the wrong place. It is the list it left keeping a hole, or
 * the list it joined ending up with two to-dos claiming one position.
 */

const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const sequence = await sequencesRepo.create(conn, {
        layerId: layer.id,
        title: 'Learn aerodynamics',
    });

    return { ownerId, project, layer, sequence };
};

/** The unorganized panel as `[text, position]` pairs, top to bottom. */
const unorganizedOrder = async (conn, projectId) => {
    const todos = await todosRepo.listUnorganized(conn, projectId);

    return todos.map((todo) => [todo.text, todo.position]);
};

/** One sequence's to-dos as `[text, position]` pairs, top to bottom. */
const sequenceOrder = async (conn, sequenceId) => {
    const todos = await todosRepo.listBySequence(conn, sequenceId);

    return todos.map((todo) => [todo.text, todo.position]);
};

describe('PUT /api/todos/:id/move', () => {
    test('files an unorganized to-do into a sequence, leaving both lists dense', async () => {
        // Arrange — three loose to-dos, and a sequence already holding two.
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'Loose A' });
        const moving = await todosRepo.create(conn, { projectId: project.id, text: 'Loose B' });
        await todosRepo.create(conn, { projectId: project.id, text: 'Loose C' });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed first',
        });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed second',
        });

        // Act — drop it between the two already filed.
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: sequence.id, position: 1 });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            id: moving.id,
            sequenceId: sequence.id,
            position: 1,
        });
        expect(await sequenceOrder(conn, sequence.id)).toEqual([
            ['Filed first', 0],
            ['Loose B', 1],
            ['Filed second', 2],
        ]);
        expect(await unorganizedOrder(conn, project.id)).toEqual([
            ['Loose A', 0],
            ['Loose C', 1],
        ]);
    });

    test('appends to a sequence when the position is its length', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const moving = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed',
        });

        // Act
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: sequence.id, position: 1 });

        // Assert
        expect(response.status).toBe(200);
        expect(await sequenceOrder(conn, sequence.id)).toEqual([
            ['Filed', 0],
            ['Loose', 1],
        ]);
    });

    test('reorders within one sequence, leaving it dense', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const first = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'First',
        });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Second',
        });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Third',
        });

        // Act — send the first one to the bottom.
        const response = await request(app)
            .put(`/api/todos/${first.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: sequence.id, position: 2 });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.position).toBe(2);
        expect(await sequenceOrder(conn, sequence.id)).toEqual([
            ['Second', 0],
            ['Third', 1],
            ['First', 2],
        ]);
    });

    test('reorders within the unorganized panel, leaving it dense', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'First' });
        await todosRepo.create(conn, { projectId: project.id, text: 'Second' });
        const third = await todosRepo.create(conn, { projectId: project.id, text: 'Third' });

        // Act
        const response = await request(app)
            .put(`/api/todos/${third.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: null, position: 0 });

        // Assert
        expect(response.status).toBe(200);
        expect(await unorganizedOrder(conn, project.id)).toEqual([
            ['Third', 0],
            ['First', 1],
            ['Second', 2],
        ]);
    });

    test('sends a to-do back out to the unorganized panel, leaving both lists dense', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed first',
        });
        const moving = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed second',
        });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed third',
        });

        // Act
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: null, position: 1 });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ sequenceId: null, position: 1 });
        expect(await unorganizedOrder(conn, project.id)).toEqual([
            ['Loose', 0],
            ['Filed second', 1],
        ]);
        expect(await sequenceOrder(conn, sequence.id)).toEqual([
            ['Filed first', 0],
            ['Filed third', 1],
        ]);
    });

    test('rejects a position past the end of the target list', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const moving = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });

        // Act — the empty sequence has room only at index 0.
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: sequence.id, position: 4 });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/position/i);
        expect(await todosRepo.findById(conn, moving.id)).toMatchObject({
            sequence_id: null,
            position: 0,
        });
    });

    test('rejects a negative position', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const moving = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });

        // Act
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: sequence.id, position: -1 });

        // Assert
        expect(response.status).toBe(400);
        expect(await todosRepo.findById(conn, moving.id)).toMatchObject({ sequence_id: null });
    });

    test('rejects a body that omits the target list', async () => {
        // Arrange — an absent sequenceId must never be read as "unorganize it".
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const moving = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed',
        });

        // Act
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ position: 0 });

        // Assert
        expect(response.status).toBe(400);
        expect(await todosRepo.findById(conn, moving.id)).toMatchObject({
            sequence_id: sequence.id,
        });
    });

    test('rejects a move into a sequence in another project', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const moving = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        const other = await projectsRepo.create(conn, { ownerId, title: 'Build a boat' });
        const otherLayer = await layersRepo.create(conn, { projectId: other.id });
        const otherSequence = await sequencesRepo.create(conn, { layerId: otherLayer.id });

        // Act
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: otherSequence.id, position: 0 });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/not in this project/i);
        expect(await sequenceOrder(conn, otherSequence.id)).toEqual([]);
    });

    test('answers 404 for a to-do that is already gone', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .put('/api/todos/987654321/move')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: null, position: 0 });

        // Assert
        expect(response.status).toBe(404);
    });

    test("answers 403 for another user's to-do", async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const moving = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .put(`/api/todos/${moving.id}/move`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({ sequenceId: sequence.id, position: 0 });

        // Assert
        expect(response.status).toBe(403);
        expect(await sequenceOrder(conn, sequence.id)).toEqual([]);
    });
});
