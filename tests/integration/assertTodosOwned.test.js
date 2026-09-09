'use strict';

const assertTodosOwned = require('../../src/lib/assertTodosOwned');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/** A project with `count` unorganized to-dos, owned by a fresh user. */
const createTodos = async (conn, count) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Auth rewrite' });

    const todos = [];
    for (let index = 0; index < count; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        todos.push(
            await todosRepo.create(conn, { projectId: project.id, text: `Step ${index}` })
        );
    }

    return { ownerId, todos };
};

describe('assertTodosOwned', () => {
    test('passes when every id belongs to the caller', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos } = await createTodos(conn, 3);

        // Act + Assert
        await expect(
            assertTodosOwned(conn, todos.map((todo) => todo.id), ownerId)
        ).resolves.toBeUndefined();
    });

    test('passes trivially for an empty set', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act + Assert
        await expect(assertTodosOwned(conn, [], ownerId)).resolves.toBeUndefined();
    });

    test('forbids a set containing someone else’s to-do', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTodos(conn, 1);
        const theirs = await createTodos(conn, 1);

        // Act + Assert
        await expect(
            assertTodosOwned(conn, [mine.todos[0].id, theirs.todos[0].id], mine.ownerId)
        ).rejects.toMatchObject({ status: 403 });
    });

    test('reports 404 when an id does not exist at all', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos } = await createTodos(conn, 1);

        // Act + Assert
        await expect(
            assertTodosOwned(conn, [todos[0].id, 999999], ownerId)
        ).rejects.toMatchObject({ status: 404 });
    });
});
