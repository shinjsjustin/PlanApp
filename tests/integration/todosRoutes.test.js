'use strict';

const request = require('supertest');

const app = require('../../src/server');
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
 * Editing and deleting a to-do (spec section 4.4). Placing one lives next door
 * in `todoMoveRoute.test.js`.
 *
 * Deleting has to leave the list it came out of densely positioned, whichever
 * list that was.
 */

describe('PATCH /api/todos/:id', () => {
    test('rewrites the text', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });

        // Act
        const response = await request(app)
            .patch(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: '  Read about lift  ' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: todo.id, text: 'Read about lift' });
    });

    test('ticks a to-do complete', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });

        // Act
        const response = await request(app)
            .patch(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ status: 'complete' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('complete');
        expect(await todosRepo.findById(conn, todo.id)).toMatchObject({ status: 'complete' });
    });

    test('marks a to-do blocked', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });

        // Act
        const response = await request(app)
            .patch(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ status: 'blocked' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('blocked');
    });

    test('rejects a status outside the enum', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });

        // Act
        const response = await request(app)
            .patch(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ status: 'nearly' });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/status/i);
        expect(await todosRepo.findById(conn, todo.id)).toMatchObject({ status: 'incomplete' });
    });

    test('rejects blank text rather than storing it', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });

        // Act
        const response = await request(app)
            .patch(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: '   ' });

        // Assert
        expect(response.status).toBe(400);
        expect(await todosRepo.findById(conn, todo.id)).toMatchObject({ text: 'Read' });
    });

    test('rejects a patch that names nothing to change', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });

        // Act
        const response = await request(app)
            .patch(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(400);
    });

    test('answers 404 for a to-do that is already gone', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .patch('/api/todos/987654321')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ status: 'complete' });

        // Assert
        expect(response.status).toBe(404);
    });

    test("answers 403 for another user's to-do", async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .patch(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({ status: 'complete' });

        // Assert
        expect(response.status).toBe(403);
        expect(await todosRepo.findById(conn, todo.id)).toMatchObject({ status: 'incomplete' });
    });
});

describe('DELETE /api/todos/:id', () => {
    test('closes the gap it leaves in its sequence', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'First',
        });
        const middle = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Middle',
        });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Last',
        });

        // Act
        const response = await request(app)
            .delete(`/api/todos/${middle.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: middle.id });
        expect(await sequenceOrder(conn, sequence.id)).toEqual([
            ['First', 0],
            ['Last', 1],
        ]);
    });

    test('closes the gap it leaves in the unorganized panel', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const first = await todosRepo.create(conn, { projectId: project.id, text: 'First' });
        await todosRepo.create(conn, { projectId: project.id, text: 'Second' });

        // Act
        await request(app)
            .delete(`/api/todos/${first.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(await unorganizedOrder(conn, project.id)).toEqual([['Second', 0]]);
    });

    test('answers 404 for a to-do that is already gone', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete('/api/todos/987654321')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });

    test("answers 403 for another user's to-do", async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete(`/api/todos/${todo.id}`)
            .set('Authorization', authHeaderFor(intruderId));

        // Assert
        expect(response.status).toBe(403);
        expect(await todosRepo.findById(conn, todo.id)).not.toBeNull();
    });
});
