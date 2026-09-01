'use strict';

const request = require('supertest');

const app = require('../../src/server');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');
const {
    createFixture,
    sequenceOrder,
    unorganizedOrder,
} = require('../helpers/todosFixture');

const getConn = useTransaction();

/**
 * Creating a to-do (spec section 4.4). A loose one and a filed one are the same
 * insert with a different column, and each lands at the end of its own list.
 */

describe('POST /api/projects/:id/todos', () => {
    test('appends an unorganized to-do when no sequence is named', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'Already loose' });

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/todos`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'Read about lift' });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            projectId: project.id,
            sequenceId: null,
            text: 'Read about lift',
            status: 'incomplete',
            position: 1,
        });
        expect(await unorganizedOrder(conn, project.id)).toEqual([
            ['Already loose', 0],
            ['Read about lift', 1],
        ]);
    });

    test('appends to the end of a sequence when one is named', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed first',
        });

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/todos`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'Filed second', sequenceId: sequence.id });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            sequenceId: sequence.id,
            text: 'Filed second',
            position: 1,
        });
        expect(await sequenceOrder(conn, sequence.id)).toEqual([
            ['Filed first', 0],
            ['Filed second', 1],
        ]);
    });

    test('treats an explicit null sequenceId as the unorganized panel', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/todos`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'Buy propellers', sequenceId: null });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data.sequenceId).toBeNull();
    });

    test('trims surrounding whitespace from the text', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/todos`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: '   Read about lift   ' });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data.text).toBe('Read about lift');
    });

    test('rejects whitespace-only text', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/todos`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: '   ' });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/text/i);
        expect(await unorganizedOrder(conn, project.id)).toEqual([]);
    });

    test('rejects a sequence belonging to another project', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const other = await projectsRepo.create(conn, { ownerId, title: 'Build a boat' });
        const otherLayer = await layersRepo.create(conn, { projectId: other.id });
        const otherSequence = await sequencesRepo.create(conn, { layerId: otherLayer.id });

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/todos`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'Read about lift', sequenceId: otherSequence.id });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/not in this project/i);
        expect(await sequenceOrder(conn, otherSequence.id)).toEqual([]);
    });

    test("answers 403 for another user's project", async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/todos`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({ text: 'Mine now' });

        // Assert
        expect(response.status).toBe(403);
        expect(await unorganizedOrder(conn, project.id)).toEqual([]);
    });

    test('rejects an unauthenticated request', async () => {
        const response = await request(app).post('/api/projects/1/todos').send({ text: 'Hi' });

        expect(response.status).toBe(401);
    });
});
