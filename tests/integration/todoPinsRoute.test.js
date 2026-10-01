'use strict';

const request = require('supertest');

const app = require('../../src/server');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { TODO_PIN_BATCH_MAX_SIZE } = require('../../src/lib/validation');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction, createTestUser } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const requestPins = (ownerId, projectId, body) =>
    request(app)
        .put(`/api/projects/${projectId}/todos/pins`)
        .set('Authorization', authHeaderFor(ownerId))
        .send(body);

const expectPinnedState = async (conn, todoIds, isPinned) => {
    const rows = await todosRepo.findByIds(conn, [...new Set(todoIds)]);

    expect(rows).toHaveLength(new Set(todoIds).size);
    expect(rows.every((row) => Boolean(row.is_pinned) === isPinned)).toBe(true);
};

const createTodos = async (conn, projectId, sequenceId = null) => {
    const first = await todosRepo.create(conn, {
        projectId,
        sequenceId,
        text: 'First',
    });
    const second = await todosRepo.create(conn, {
        projectId,
        sequenceId,
        text: 'Second',
    });

    return [first, second];
};

describe('PUT /api/projects/:id/todos/pins', () => {
    test('pins multiple to-dos and returns full updated payloads', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const todos = await createTodos(conn, project.id, sequence.id);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds: todos.map((todo) => todo.id),
            isPinned: true,
        });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.todos).toHaveLength(2);
        expect(response.body.data.todos.map((todo) => todo.id)).toEqual(
            todos.map((todo) => todo.id)
        );
        expect(Object.keys(response.body.data.todos[0]).sort()).toEqual([
            'completedAt',
            'createdAt',
            'id',
            'isPinned',
            'note',
            'position',
            'projectId',
            'sequenceId',
            'status',
            'text',
            'updatedAt',
        ]);
        expect(response.body.data.todos.every((todo) => todo.isPinned)).toBe(true);
        await expectPinnedState(conn, todos.map((todo) => todo.id), true);
    });

    test('unpins multiple to-dos in one request', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todos = await createTodos(conn, project.id);
        const todoIds = todos.map((todo) => todo.id);
        await todosRepo.setPinned(conn, todoIds, true);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds,
            isPinned: false,
        });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.todos.every((todo) => !todo.isPinned)).toBe(true);
        await expectPinnedState(conn, todoIds, false);
    });

    test('accepts complete, blocked, and unorganized to-dos in the same batch', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const complete = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Complete',
        });
        const blocked = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Blocked',
        });
        const unorganized = await todosRepo.create(conn, {
            projectId: project.id,
            text: 'Unorganized',
        });
        await todosRepo.update(conn, complete.id, { status: 'complete' });
        await todosRepo.update(conn, blocked.id, { status: 'blocked' });
        const todoIds = [complete.id, blocked.id, unorganized.id];

        // Act
        const response = await requestPins(ownerId, project.id, { todoIds, isPinned: true });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.todos).toEqual([
            expect.objectContaining({ id: complete.id, status: 'complete', isPinned: true }),
            expect.objectContaining({ id: blocked.id, status: 'blocked', isPinned: true }),
            expect.objectContaining({ id: unorganized.id, sequenceId: null, isPinned: true }),
        ]);
    });

    test('deduplicates repeated ids before persistence and read-back', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todos = await createTodos(conn, project.id);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds: [todos[0].id, todos[0].id, todos[1].id],
            isPinned: true,
        });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.todos.map((todo) => todo.id)).toEqual([
            todos[0].id,
            todos[1].id,
        ]);
        await expectPinnedState(conn, todos.map((todo) => todo.id), true);
    });

    test.each([
        ['an empty todoIds array', []],
        ['a non-array todoIds', 'not-an-array'],
    ])('rejects %s without writing', async (_label, todoIds) => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const [todo] = await createTodos(conn, project.id);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds,
            isPinned: true,
        });

        // Assert
        expect(response.status).toBe(400);
        await expectPinnedState(conn, [todo.id], false);
    });

    test.each([
        ['a non-integer id', 1.5],
        ['a negative id', -1],
    ])('rejects %s without writing', async (_label, invalidId) => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const [todo] = await createTodos(conn, project.id);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds: [todo.id, invalidId],
            isPinned: true,
        });

        // Assert
        expect(response.status).toBe(400);
        await expectPinnedState(conn, [todo.id], false);
    });

    test('rejects a batch above the maximum size without writing', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const [todo] = await createTodos(conn, project.id);
        const todoIds = Array.from(
            { length: TODO_PIN_BATCH_MAX_SIZE + 1 },
            (_value, index) => todo.id + index
        );

        // Act
        const response = await requestPins(ownerId, project.id, { todoIds, isPinned: true });

        // Assert
        expect(response.status).toBe(400);
        await expectPinnedState(conn, [todo.id], false);
    });

    test.each([
        ['a truthy string', 'true'],
        ['a numeric flag', 1],
    ])('rejects %s for isPinned without writing', async (_label, isPinned) => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const [todo] = await createTodos(conn, project.id);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds: [todo.id],
            isPinned,
        });

        // Assert
        expect(response.status).toBe(400);
        await expectPinnedState(conn, [todo.id], false);
    });

    test('rejects a missing to-do id without writing valid rows', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const [todo] = await createTodos(conn, project.id);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds: [todo.id, 999999],
            isPinned: true,
        });

        // Assert
        expect(response.status).toBe(404);
        expect(response.body.error).toMatch(/To-do/);
        await expectPinnedState(conn, [todo.id], false);
    });

    test('rejects a to-do from another project owned by the caller without writing', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const [todo] = await createTodos(conn, project.id);
        const otherProject = await projectsRepo.create(conn, { ownerId, title: 'Other' });
        const [otherTodo] = await createTodos(conn, otherProject.id);

        // Act
        const response = await requestPins(ownerId, project.id, {
            todoIds: [todo.id, otherTodo.id],
            isPinned: true,
        });

        // Assert
        expect(response.status).toBe(400);
        await expectPinnedState(conn, [todo.id, otherTodo.id], false);
    });

    test('rejects another user\'s to-do without writing any rows', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createFixture(conn);
        const theirs = await createFixture(conn);
        const [myTodo] = await createTodos(conn, mine.project.id);
        const [theirTodo] = await createTodos(conn, theirs.project.id);

        // Act
        const response = await requestPins(mine.ownerId, mine.project.id, {
            todoIds: [myTodo.id, theirTodo.id],
            isPinned: true,
        });

        // Assert
        expect(response.status).toBe(403);
        await expectPinnedState(conn, [myTodo.id, theirTodo.id], false);
    });

    test('validates project ownership before inspecting the body', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const other = await createFixture(conn);
        const [todo] = await createTodos(conn, other.project.id);

        // Act
        const response = await requestPins(ownerId, other.project.id, {
            todoIds: [],
            isPinned: 'true',
        });

        // Assert
        expect(response.status).toBe(403);
        await expectPinnedState(conn, [todo.id], false);
    });
});
