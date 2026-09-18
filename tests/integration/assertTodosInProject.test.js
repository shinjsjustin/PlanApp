'use strict';

const assertTodosInProject = require('../../src/lib/assertTodosInProject');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const createProjectTodo = async (conn, ownerId, title) => {
    const project = await projectsRepo.create(conn, { ownerId, title });
    const todo = await todosRepo.create(conn, { projectId: project.id, text: `${title} task` });

    return { project, todo };
};

describe('assertTodosInProject', () => {
    test('passes when every id belongs to the project and caller', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, todo: first } = await createProjectTodo(conn, ownerId, 'First');
        const second = await todosRepo.create(conn, {
            projectId: project.id,
            text: 'Second task',
        });

        // Act + Assert
        await expect(
            assertTodosInProject(conn, [first.id, second.id], project.id, ownerId)
        ).resolves.toBeUndefined();
    });

    test('passes trivially for an empty set', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project } = await createProjectTodo(conn, ownerId, 'Empty');

        // Act + Assert
        await expect(
            assertTodosInProject(conn, [], project.id, ownerId)
        ).resolves.toBeUndefined();
    });

    test('reports 404 when an id does not exist', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, todo } = await createProjectTodo(conn, ownerId, 'Mine');

        // Act + Assert
        await expect(
            assertTodosInProject(conn, [todo.id, 999999], project.id, ownerId)
        ).rejects.toMatchObject({ status: 404 });
    });

    test('forbids a set containing another user\'s to-do', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherOwnerId = await createTestUser(conn);
        const mine = await createProjectTodo(conn, ownerId, 'Mine');
        const theirs = await createProjectTodo(conn, otherOwnerId, 'Theirs');

        // Act + Assert
        await expect(
            assertTodosInProject(
                conn,
                [mine.todo.id, theirs.todo.id],
                mine.project.id,
                ownerId
            )
        ).rejects.toMatchObject({ status: 403 });
    });

    test('rejects a to-do from another project owned by the caller', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const first = await createProjectTodo(conn, ownerId, 'First');
        const second = await createProjectTodo(conn, ownerId, 'Second');

        // Act + Assert
        await expect(
            assertTodosInProject(
                conn,
                [first.todo.id, second.todo.id],
                first.project.id,
                ownerId
            )
        ).rejects.toMatchObject({ status: 400 });
    });

    test('deduplicates ids before comparing the complete result set', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, todo } = await createProjectTodo(conn, ownerId, 'Mine');

        // Act + Assert
        await expect(
            assertTodosInProject(conn, [todo.id, todo.id], project.id, ownerId)
        ).resolves.toBeUndefined();
    });
});
