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
 * The layer half of spec section 4.4. Every request runs on the connection the
 * test opened, so everything the routes write is rolled back afterwards
 * (tests/helpers/db.js).
 *
 * The property asserted over and over here is that `position` stays dense —
 * 0..n-1 with no gaps and no duplicates — through inserts and deletes alike.
 */

/** A project with `count` layers, titled so their order is readable. */
const createProjectWithLayers = async (conn, count) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });

    const layers = [];
    for (let index = 0; index < count; index += 1) {
        // Sequential on purpose: one mysql2 connection runs one statement at a
        // time, and each insert has to see the ones before it to place itself.
        // eslint-disable-next-line no-await-in-loop
        layers.push(
            await layersRepo.create(conn, { projectId: project.id, title: `Layer ${index}` })
        );
    }

    return { ownerId, project, layers };
};

/** The project's layers as `[title, position]` pairs, top to bottom. */
const layerOrder = async (conn, projectId) => {
    const layers = await layersRepo.listByProject(conn, projectId);

    return layers.map((layer) => [layer.title, layer.position]);
};

describe('POST /api/projects/:id/layers', () => {
    test('appends a layer at the end when no afterLayerId is given', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createProjectWithLayers(conn, 2);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/layers`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            projectId: project.id,
            title: 'Untitled layer',
            position: 2,
        });
        expect(await layerOrder(conn, project.id)).toEqual([
            ['Layer 0', 0],
            ['Layer 1', 1],
            ['Untitled layer', 2],
        ]);
    });

    test('inserts directly below the given layer and reindexes the ones beneath', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layers } = await createProjectWithLayers(conn, 3);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/layers`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ afterLayerId: layers[0].id });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data.position).toBe(1);
        expect(await layerOrder(conn, project.id)).toEqual([
            ['Layer 0', 0],
            ['Untitled layer', 1],
            ['Layer 1', 2],
            ['Layer 2', 3],
        ]);
    });

    test('leaves positions dense 0..n-1 after an insert in the middle', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layers } = await createProjectWithLayers(conn, 4);

        // Act
        await request(app)
            .post(`/api/projects/${project.id}/layers`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ afterLayerId: layers[1].id });

        // Assert
        const positions = (await layersRepo.listByProject(conn, project.id)).map((l) => l.position);
        expect(positions).toEqual([0, 1, 2, 3, 4]);
    });

    test('rejects an afterLayerId belonging to another project of the same owner', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createProjectWithLayers(conn, 1);
        const other = await projectsRepo.create(conn, { ownerId, title: 'Other project' });
        const strayLayer = await layersRepo.create(conn, { projectId: other.id });

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/layers`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ afterLayerId: strayLayer.id });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ success: false });
        expect(await layerOrder(conn, project.id)).toEqual([['Layer 0', 0]]);
    });

    test('rejects an afterLayerId that does not resolve to a layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createProjectWithLayers(conn, 1);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/layers`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ afterLayerId: 987654321 });

        // Assert
        expect(response.status).toBe(404);
    });

    test('answers 403 for another user\'s project', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createProjectWithLayers(conn, 1);
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/layers`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({});

        // Assert
        expect(response.status).toBe(403);
        expect(await layerOrder(conn, project.id)).toEqual([['Layer 0', 0]]);
    });

    test('rejects an unauthenticated request', async () => {
        const response = await request(app).post('/api/projects/1/layers').send({});

        expect(response.status).toBe(401);
    });
});

describe('PATCH /api/layers/:id', () => {
    test('renames a layer and returns the stored row', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layers } = await createProjectWithLayers(conn, 1);

        // Act
        const response = await request(app)
            .patch(`/api/layers/${layers[0].id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ title: '  Learning  ' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: layers[0].id, title: 'Learning' });
        expect(await layersRepo.findById(conn, layers[0].id)).toMatchObject({ title: 'Learning' });
    });

    test('rejects a blank title rather than storing one', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, layers } = await createProjectWithLayers(conn, 1);

        // Act
        const response = await request(app)
            .patch(`/api/layers/${layers[0].id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ title: '   ' });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/title/i);
        expect(await layersRepo.findById(conn, layers[0].id)).toMatchObject({ title: 'Layer 0' });
    });

    test('answers 403 for another user\'s layer', async () => {
        // Arrange
        const conn = getConn();
        const { layers } = await createProjectWithLayers(conn, 1);
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .patch(`/api/layers/${layers[0].id}`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({ title: 'Mine now' });

        // Assert
        expect(response.status).toBe(403);
        expect(await layersRepo.findById(conn, layers[0].id)).toMatchObject({ title: 'Layer 0' });
    });
});

describe('DELETE /api/layers/:id', () => {
    test('removes the layer and closes the gap it leaves', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layers } = await createProjectWithLayers(conn, 3);

        // Act
        const response = await request(app)
            .delete(`/api/layers/${layers[1].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: layers[1].id });
        expect(await layerOrder(conn, project.id)).toEqual([
            ['Layer 0', 0],
            ['Layer 2', 1],
        ]);
    });

    test('cascades to its sequences and returns their to-dos to unorganized', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, layers } = await createProjectWithLayers(conn, 2);
        const sequence = await sequencesRepo.create(conn, { layerId: layers[0].id });
        const loose = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        const filed = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed',
        });

        // Act
        const response = await request(app)
            .delete(`/api/layers/${layers[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(await sequencesRepo.findById(conn, sequence.id)).toBeNull();
        expect(await todosRepo.listUnorganized(conn, project.id)).toEqual([
            expect.objectContaining({ id: loose.id, sequence_id: null, position: 0 }),
            expect.objectContaining({ id: filed.id, sequence_id: null, position: 1 }),
        ]);
    });

    test('answers 404 for a layer that is already gone', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete('/api/layers/987654321')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });

    test('answers 403 for another user\'s layer', async () => {
        // Arrange
        const conn = getConn();
        const { project, layers } = await createProjectWithLayers(conn, 1);
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete(`/api/layers/${layers[0].id}`)
            .set('Authorization', authHeaderFor(intruderId));

        // Assert
        expect(response.status).toBe(403);
        expect(await layerOrder(conn, project.id)).toEqual([['Layer 0', 0]]);
    });
});
