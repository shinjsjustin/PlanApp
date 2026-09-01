'use strict';

const request = require('supertest');

const app = require('../../src/server');
const edgesRepo = require('../../src/db/repositories/edgesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * The sequence half of spec section 4.4.
 *
 * The case worth stating plainly: deleting a sequence must not destroy the work
 * filed in it. `todos.sequence_id` is ON DELETE SET NULL, so those to-dos return
 * to the unorganized panel — and their positions have to be reindexed, because
 * the database only nulls the column and knows nothing about ordering.
 */

const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });

    return { ownerId, project, layer };
};

/** The layer's sequences as `[title, position]` pairs, left to right. */
const sequenceOrder = async (conn, layerId) => {
    const sequences = await sequencesRepo.listByLayer(conn, layerId);

    return sequences.map((sequence) => [sequence.title, sequence.position]);
};

describe('POST /api/layers/:id/sequences', () => {
    test('creates an untitled sequence at the end of the layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        await sequencesRepo.create(conn, { layerId: layer.id, title: 'Learn aerodynamics' });

        // Act
        const response = await request(app)
            .post(`/api/layers/${layer.id}/sequences`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            projectId: project.id,
            layerId: layer.id,
            title: 'Untitled sequence',
            description: null,
            isBlocked: false,
            position: 1,
        });
        expect(await sequenceOrder(conn, layer.id)).toEqual([
            ['Learn aerodynamics', 0],
            ['Untitled sequence', 1],
        ]);
    });

    test('takes the project from the layer rather than from the caller', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/layers/${layer.id}/sequences`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ projectId: 987654321 });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data.projectId).toBe(project.id);
    });

    test('answers 403 for another user\'s layer', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createFixture(conn);
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post(`/api/layers/${layer.id}/sequences`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({});

        // Assert
        expect(response.status).toBe(403);
        expect(await sequenceOrder(conn, layer.id)).toEqual([]);
    });

    test('rejects an unauthenticated request', async () => {
        const response = await request(app).post('/api/layers/1/sequences').send({});

        expect(response.status).toBe(401);
    });
});

describe('PATCH /api/sequences/:id', () => {
    test('renames a sequence', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ title: '  Learn electronics  ' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            id: sequence.id,
            title: 'Learn electronics',
        });
    });

    test('sets the manual blocked override', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ isBlocked: true });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.isBlocked).toBe(true);
        expect(await sequencesRepo.findById(conn, sequence.id)).toMatchObject({ is_blocked: 1 });
    });

    test('clears the blocked override again', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
        await sequencesRepo.update(conn, sequence.id, { isBlocked: true });

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ isBlocked: false });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.isBlocked).toBe(false);
    });

    // Folding a card shut is remembered per sequence, so a collapsed card stays
    // collapsed across a reload and across the owner's devices. It travels on
    // the same PATCH as the rest of a sequence — it is not status, but it is a
    // change to the sequence like any other.

    test('folds a card shut', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ isCollapsed: true });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.isCollapsed).toBe(true);
        expect(await sequencesRepo.findById(conn, sequence.id)).toMatchObject({
            is_collapsed: 1,
        });
    });

    test('opens a folded card again', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
        await sequencesRepo.update(conn, sequence.id, { isCollapsed: true });

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ isCollapsed: false });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.isCollapsed).toBe(false);
    });

    test('reports a new sequence as open', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        // Act
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Assert
        expect(sequence.is_collapsed).toBe(0);
    });

    test('clears a description when sent an empty one', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, {
            layerId: layer.id,
            description: 'Lift and drag',
        });

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ description: '' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.description).toBeNull();
    });

    test('rejects a patch that names nothing to change', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(400);
    });

    test('answers 403 for another user\'s sequence', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, {
            layerId: layer.id,
            title: 'Learn aerodynamics',
        });
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({ title: 'Mine now' });

        // Assert
        expect(response.status).toBe(403);
        expect(await sequencesRepo.findById(conn, sequence.id)).toMatchObject({
            title: 'Learn aerodynamics',
        });
    });
});

describe('DELETE /api/sequences/:id', () => {
    test('leaves its to-dos alive with a NULL sequence_id', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
        const filed = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Read about lift',
        });

        // Act
        const response = await request(app)
            .delete(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: sequence.id });
        expect(await todosRepo.findById(conn, filed.id)).toMatchObject({
            id: filed.id,
            sequence_id: null,
            text: 'Read about lift',
        });
    });

    test('appends the freed to-dos to the unorganized list without colliding', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
        const loose = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        const first = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed first',
        });
        const second = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed second',
        });

        // Act
        await request(app)
            .delete(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(await todosRepo.listUnorganized(conn, project.id)).toEqual([
            expect.objectContaining({ id: loose.id, position: 0 }),
            expect.objectContaining({ id: first.id, position: 1 }),
            expect.objectContaining({ id: second.id, position: 2 }),
        ]);
    });

    test('closes the gap it leaves in its layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);
        const first = await sequencesRepo.create(conn, { layerId: layer.id, title: 'First' });
        const middle = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Middle' });
        await sequencesRepo.create(conn, { layerId: layer.id, title: 'Last' });

        // Act
        await request(app)
            .delete(`/api/sequences/${middle.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(await sequenceOrder(conn, layer.id)).toEqual([
            ['First', 0],
            ['Last', 1],
        ]);
        expect(await sequencesRepo.findById(conn, first.id)).toMatchObject({ position: 0 });
    });

    test('takes its edges with it', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        const lower = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
        const parent = await sequencesRepo.create(conn, { layerId: layer.id });
        const child = await sequencesRepo.create(conn, { layerId: lower.id });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act
        await request(app)
            .delete(`/api/sequences/${parent.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(await edgesRepo.listByProject(conn, project.id)).toEqual([]);
    });

    test('answers 404 for a sequence that is already gone', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete('/api/sequences/987654321')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });

    test('answers 403 for another user\'s sequence', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createFixture(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(intruderId));

        // Assert
        expect(response.status).toBe(403);
        expect(await sequencesRepo.findById(conn, sequence.id)).not.toBeNull();
    });
});
