'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { bindConnection } = require('../../src/db/unitOfWork');
const { authHeaderFor } = require('../helpers/auth');
const { createTestUser, useTransaction } = require('../helpers/db');

const getConn = useTransaction();

const listProjects = (ownerId) =>
    request(app).get('/api/projects').set('Authorization', authHeaderFor(ownerId));

const createPinnedTodo = async (conn, { projectId, sequenceId = null, text, status }) => {
    const todo = await todosRepo.create(conn, { projectId, sequenceId, text });
    const current = status ? await todosRepo.update(conn, todo.id, { status }) : todo;
    await todosRepo.setPinned(conn, [todo.id], true);

    return current;
};

const createPinnedProject = async (conn, ownerId, title) => {
    const project = await projectsRepo.create(conn, { ownerId, title });
    const layer = await layersRepo.create(conn, { projectId: project.id });
    const sequence = await sequencesRepo.create(conn, { layerId: layer.id, title: 'First' });
    const todo = await createPinnedTodo(conn, {
        projectId: project.id,
        sequenceId: sequence.id,
        text: `${title} task`,
    });

    return { project, sequence, todo };
};

/** The card query plus the owner-wide pinned query, and nothing else. */
const PROJECT_LIST_STATEMENT_COUNT = 2;

const countingConnection = (conn) => {
    const counter = { statements: 0 };
    const proxy = {
        execute: (...args) => {
            counter.statements += 1;
            return conn.execute(...args);
        },
        query: (...args) => {
            counter.statements += 1;
            return conn.query(...args);
        },
    };

    return { counter, proxy };
};

const countListStatements = async (conn, ownerId) => {
    const { counter, proxy } = countingConnection(conn);

    bindConnection(proxy);
    try {
        const response = await listProjects(ownerId);
        return { response, statements: counter.statements };
    } finally {
        bindConnection(conn);
    }
};

describe('project pinnedTodos payloads', () => {
    test('returns pinned to-dos in frozen order and exact wire shape', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'Launch' });
        const firstLayer = await layersRepo.create(conn, { projectId: project.id, title: 'Plan' });
        const secondLayer = await layersRepo.create(conn, { projectId: project.id, title: 'Ship' });
        const firstSequence = await sequencesRepo.create(conn, {
            layerId: firstLayer.id,
            title: 'Research',
        });
        const secondSequence = await sequencesRepo.create(conn, {
            layerId: firstLayer.id,
            title: 'Prototype',
        });
        const thirdSequence = await sequencesRepo.create(conn, {
            layerId: secondLayer.id,
            title: 'Release',
        });

        const first = await createPinnedTodo(conn, {
            projectId: project.id,
            sequenceId: firstSequence.id,
            text: 'Read reports',
            status: 'complete',
        });
        const second = await createPinnedTodo(conn, {
            projectId: project.id,
            sequenceId: firstSequence.id,
            text: 'Summarize risks',
            status: 'blocked',
        });
        const third = await createPinnedTodo(conn, {
            projectId: project.id,
            sequenceId: secondSequence.id,
            text: 'Build mock',
        });
        const fourth = await createPinnedTodo(conn, {
            projectId: project.id,
            sequenceId: thirdSequence.id,
            text: 'Publish',
        });
        const unorganized = await createPinnedTodo(conn, {
            projectId: project.id,
            text: 'Sort later',
        });

        // Act
        const response = await listProjects(ownerId);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data[0]).toMatchObject({
            id: project.id,
            todoCount: 5,
            completedTodoCount: 1,
        });
        expect(Object.keys(response.body.data[0]).sort()).toEqual(
            [
                'completedTodoCount',
                'createdAt',
                'description',
                'id',
                'pinnedTodos',
                'title',
                'todoCount',
                'updatedAt',
            ].sort()
        );
        expect(response.body.data[0].pinnedTodos).toEqual([
            {
                id: first.id,
                text: 'Read reports',
                status: 'complete',
                sequenceId: firstSequence.id,
                sequenceTitle: 'Research',
                position: 0,
                isPinned: true,
            },
            {
                id: second.id,
                text: 'Summarize risks',
                status: 'blocked',
                sequenceId: firstSequence.id,
                sequenceTitle: 'Research',
                position: 1,
                isPinned: true,
            },
            {
                id: third.id,
                text: 'Build mock',
                status: 'incomplete',
                sequenceId: secondSequence.id,
                sequenceTitle: 'Prototype',
                position: 0,
                isPinned: true,
            },
            {
                id: fourth.id,
                text: 'Publish',
                status: 'incomplete',
                sequenceId: thirdSequence.id,
                sequenceTitle: 'Release',
                position: 0,
                isPinned: true,
            },
            {
                id: unorganized.id,
                text: 'Sort later',
                status: 'incomplete',
                sequenceId: null,
                sequenceTitle: null,
                position: 0,
                isPinned: true,
            },
        ]);
    });

    test('returns an empty pinnedTodos array on every project without pins', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await projectsRepo.create(conn, { ownerId, title: 'One' });
        await projectsRepo.create(conn, { ownerId, title: 'Two' });

        // Act
        const response = await listProjects(ownerId);

        // Assert
        expect(response.body.data).toHaveLength(2);
        response.body.data.forEach((project) => expect(project.pinnedTodos).toEqual([]));
    });

    test("never includes another user's pins", async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await projectsRepo.create(conn, { ownerId, title: 'Mine' });
        await createPinnedProject(conn, otherId, 'Theirs');

        // Act
        const response = await listProjects(ownerId);

        // Assert
        expect(response.body.data).toEqual([
            expect.objectContaining({ title: 'Mine', pinnedTodos: [] }),
        ]);
    });

    test('reads every card and every pin in two statements as projects grow', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await createPinnedProject(conn, ownerId, 'One');

        // Act
        const one = await countListStatements(conn, ownerId);
        await createPinnedProject(conn, ownerId, 'Two');
        await createPinnedProject(conn, ownerId, 'Three');
        await createPinnedProject(conn, ownerId, 'Four');
        const four = await countListStatements(conn, ownerId);

        // Assert
        expect(one.response.body.data).toHaveLength(1);
        expect(four.response.body.data).toHaveLength(4);
        // One statement for the cards, one for every pin the owner has. Pinning
        // the exact count, not just its constancy, keeps a second read from
        // creeping back in unnoticed.
        expect(one.statements).toBe(PROJECT_LIST_STATEMENT_COUNT);
        expect(four.statements).toBe(one.statements);
        four.response.body.data.forEach((project) => expect(project.pinnedTodos).toHaveLength(1));
    });

    test('POST and PATCH return the same pinnedTodos card shape as GET', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const created = await request(app)
            .post('/api/projects')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ title: 'New' });
        const patched = await request(app)
            .patch(`/api/projects/${created.body.data.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ title: 'Renamed' });

        // Assert
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({
            title: 'New',
            todoCount: 0,
            completedTodoCount: 0,
            pinnedTodos: [],
        });
        expect(patched.status).toBe(200);
        expect(patched.body.data).toMatchObject({
            title: 'Renamed',
            todoCount: 0,
            completedTodoCount: 0,
            pinnedTodos: [],
        });
    });
});
