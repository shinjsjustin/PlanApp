'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { bindConnection } = require('../../src/db/unitOfWork');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * `GET /api/projects` and the ready frontier it carries (spec sections 4.3 and
 * 4.8). The derivation itself is unit-tested against the shared fixture table in
 * `tests/unit/frontier.test.js`; what is proved here is that the route feeds it
 * the right rows, scopes them to the caller, and does so without an N+1.
 */

const listProjects = (ownerId) =>
    request(app).get('/api/projects').set('Authorization', authHeaderFor(ownerId));

/** A to-do in a sequence, created and then moved to the status the test wants. */
const addTodo = async (conn, { projectId, sequenceId = null, text, status = 'incomplete' }) => {
    const todo = await todosRepo.create(conn, { projectId, sequenceId, text });

    if (status === 'incomplete') return todo;

    return todosRepo.update(conn, todo.id, { status });
};

/**
 * The drone project from spec section 1, built for real in the database: three
 * layers, the first of them holding three sequences.
 *
 * Aerodynamics is finished and electronics is not, so the learning layer offers
 * electronics. Design and build each hold one unfinished sequence, and since
 * layers do not gate one another, all three layers contribute a line.
 */
const createDroneProject = async (conn, ownerId, title = 'Build a drone') => {
    const project = await projectsRepo.create(conn, { ownerId, title });
    const learning = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const design = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
    const build = await layersRepo.create(conn, { projectId: project.id, title: 'Build' });

    const aerodynamics = await sequencesRepo.create(conn, {
        layerId: learning.id,
        title: 'Learn aerodynamics',
    });
    const electronics = await sequencesRepo.create(conn, {
        layerId: learning.id,
        title: 'Learn electronics',
    });
    const networking = await sequencesRepo.create(conn, {
        layerId: learning.id,
        title: 'Learn network communications',
    });
    const rotor = await sequencesRepo.create(conn, {
        layerId: design.id,
        title: 'Design rotor system',
    });
    const wifi = await sequencesRepo.create(conn, {
        layerId: build.id,
        title: 'Connect drone to wifi',
    });

    const todo = (sequenceId, text, status) =>
        addTodo(conn, { projectId: project.id, sequenceId, text, status });

    await todo(aerodynamics.id, 'Read up on lift', 'complete');
    await todo(electronics.id, 'Learn to solder', 'complete');
    await todo(electronics.id, 'Understand ESCs', 'incomplete');
    await todo(electronics.id, 'Read the datasheets', 'incomplete');
    await todo(networking.id, 'Learn 802.11 basics', 'complete');
    await todo(rotor.id, 'Pick a rotor size', 'incomplete');
    await todo(wifi.id, 'Bring up the radio', 'incomplete');
    await addTodo(conn, { projectId: project.id, text: 'Buy a soldering iron' });

    return { project, electronics, rotor, wifi };
};

/**
 * Wraps the test's connection so every statement the request runs is counted.
 * The route layer takes whatever `bindConnection` gives it, so this needs no
 * seam in the production code.
 */
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

    return { proxy, counter };
};

/** Runs one `GET /api/projects` and reports how many statements it took. */
const countStatements = async (conn, ownerId) => {
    const { proxy, counter } = countingConnection(conn);

    bindConnection(proxy);
    try {
        const response = await listProjects(ownerId);

        return { statements: counter.statements, body: response.body };
    } finally {
        bindConnection(conn);
    }
};

describe('GET /api/projects — ready frontier', () => {
    test('surfaces one frontier line per layer, with its next incomplete to-do', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await createDroneProject(conn, ownerId);

        // Act
        const response = await listProjects(ownerId);

        // Assert — learning has finished aerodynamics and moved on to
        // electronics; design and build each offer their own first unfinished
        // sequence, in layer order.
        expect(response.status).toBe(200);
        expect(response.body.data[0].frontier).toEqual([
            {
                sequenceId: expect.any(Number),
                sequenceTitle: 'Learn electronics',
                nextTodo: { id: expect.any(Number), text: 'Understand ESCs' },
                isStalled: false,
            },
            {
                sequenceId: expect.any(Number),
                sequenceTitle: 'Design rotor system',
                nextTodo: { id: expect.any(Number), text: 'Pick a rotor size' },
                isStalled: false,
            },
            {
                sequenceId: expect.any(Number),
                sequenceTitle: 'Connect drone to wifi',
                nextTodo: { id: expect.any(Number), text: 'Bring up the radio' },
                isStalled: false,
            },
        ]);
    });

    test('reports a ready sequence holding no to-dos with a null next to-do', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
        const layer = await layersRepo.create(conn, { projectId: project.id });
        await sequencesRepo.create(conn, { layerId: layer.id, title: 'Learn aerodynamics' });

        // Act
        const response = await listProjects(ownerId);

        // Assert — nothing to pick up, but only because it is empty.
        expect(response.body.data[0].frontier).toEqual([
            {
                sequenceId: expect.any(Number),
                sequenceTitle: 'Learn aerodynamics',
                nextTodo: null,
                isStalled: false,
            },
        ]);
    });

    /**
     * Since blocked to-dos stopped counting as a next step (spec section 3) a
     * sequence full of them also reports a null `nextTodo`, and the card must
     * not read that as "no to-dos yet". `isStalled` is what separates the two.
     */
    test('marks a ready sequence whose outstanding work is all blocked as stalled', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
        const layer = await layersRepo.create(conn, { projectId: project.id });
        const sequence = await sequencesRepo.create(conn, {
            layerId: layer.id,
            title: 'Learn aerodynamics',
        });
        await addTodo(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Read up on lift',
            status: 'complete',
        });
        await addTodo(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Wait on the wind tunnel',
            status: 'blocked',
        });

        // Act
        const response = await listProjects(ownerId);

        // Assert — still on the frontier, because the sequence itself is not
        // blocked by hand; nothing in it can be started, which is what it says.
        expect(response.body.data[0].frontier).toEqual([
            {
                sequenceId: sequence.id,
                sequenceTitle: 'Learn aerodynamics',
                nextTodo: null,
                isStalled: true,
            },
        ]);
    });

    test('returns an empty frontier for a project whose every sequence is complete', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
        const layer = await layersRepo.create(conn, { projectId: project.id });
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
        await addTodo(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Read up on lift',
            status: 'complete',
        });

        // Act
        const response = await listProjects(ownerId);

        // Assert — an empty frontier, but the project does hold a sequence, which
        // is what lets the card tell "all done" from "nothing planned yet".
        expect(response.body.data[0]).toMatchObject({
            frontier: [],
            sequenceCount: 1,
            todoCount: 1,
            completedTodoCount: 1,
        });
    });

    test('lets a blocked sequence suppress its own layer and no other', async () => {
        // Arrange — the drone project, with electronics marked blocked by hand.
        // It is the learning layer's first unfinished sequence, so that layer
        // goes quiet; the layers below it are untouched.
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { electronics } = await createDroneProject(conn, ownerId);
        await sequencesRepo.update(conn, electronics.id, { isBlocked: true });

        // Act
        const response = await listProjects(ownerId);

        // Assert — and network communications, sitting behind the block in the
        // same layer, does not take its turn.
        expect(response.body.data[0].frontier.map((entry) => entry.sequenceTitle)).toEqual([
            'Design rotor system',
            'Connect drone to wifi',
        ]);
        expect(response.body.data[0]).toMatchObject({
            sequenceCount: 5,
            blockedSequenceCount: 1,
        });
    });

    test('reports no sequences at all as a sequence count of zero', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
        await addTodo(conn, { projectId: project.id, text: 'Buy a soldering iron' });

        // Act
        const response = await listProjects(ownerId);

        // Assert
        expect(response.body.data[0]).toMatchObject({
            frontier: [],
            sequenceCount: 0,
            todoCount: 1,
        });
    });

    test("never leaks another user's sequences into a frontier", async () => {
        // Arrange — the stranger owns a drone project; the caller owns nothing
        // but an empty project of their own.
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        await createDroneProject(conn, strangerId, 'Their drone');
        await projectsRepo.create(conn, { ownerId, title: 'Mine' });

        // Act
        const response = await listProjects(ownerId);

        // Assert
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({ title: 'Mine', frontier: [] });
    });

    test('computes every frontier in a constant number of queries as projects are added', async () => {
        // Arrange — one full drone project, then four more.
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await createDroneProject(conn, ownerId, 'Drone 1');

        // Act
        const one = await countStatements(conn, ownerId);

        for (let n = 2; n <= 5; n += 1) {
            await createDroneProject(conn, ownerId, `Drone ${n}`);
        }

        const five = await countStatements(conn, ownerId);

        // Assert — the whole point of the batched load: five times the projects,
        // five times the layers and sequences, and the same number of queries.
        expect(one.body.data).toHaveLength(1);
        expect(five.body.data).toHaveLength(5);
        expect(five.statements).toBe(one.statements);

        // And it is genuinely computing frontiers, not returning nothing.
        five.body.data.forEach((project) => {
            expect(project.frontier).toHaveLength(3);
        });
    });
});

/**
 * The home page keeps its grid in step by dropping the server's response into
 * the list it already holds, so a create or a rename must answer in the same
 * shape the list does. A response missing `frontier` would blank a card's body —
 * or, since the card reads it directly, break the render outright.
 */
describe('the project payload shape is the same everywhere', () => {
    test('POST /api/projects answers with an empty frontier and no sequences', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post('/api/projects')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ title: 'Build a drone' });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            title: 'Build a drone',
            frontier: [],
            sequenceCount: 0,
            todoCount: 0,
            completedTodoCount: 0,
        });
    });

    test('PATCH /api/projects/:id answers with the frontier still attached', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project } = await createDroneProject(conn, ownerId);

        // Act
        const response = await request(app)
            .patch(`/api/projects/${project.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ title: 'Build a better drone' });

        // Assert — renaming a project cannot change what is ready in it.
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            title: 'Build a better drone',
            sequenceCount: 5,
        });
        expect(response.body.data.frontier.map((entry) => entry.sequenceTitle)).toEqual([
            'Learn electronics',
            'Design rotor system',
            'Connect drone to wifi',
        ]);
    });
});
