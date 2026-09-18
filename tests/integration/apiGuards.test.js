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
 * The two guarantees the whole API rests on, asserted over every endpoint in
 * spec section 4.4 rather than route by route.
 *
 * The individual route suites already check the cases they care about — but they
 * check the routes they know about. This is a census: the table below is the
 * complete API surface, so an endpoint added later without `isAuth`, or without
 * an ownership check, turns this red instead of slipping past suites that were
 * never told it exists.
 *
 * Each entry carries a body good enough to pass its own validation, so a 403
 * here means the ownership check refused the request rather than a missing
 * field doing it — which would prove nothing about who may reach the resource.
 */

const buildGraph = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const upper = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const lower = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
    const parent = await sequencesRepo.create(conn, { layerId: upper.id, title: 'Aerodynamics' });
    const child = await sequencesRepo.create(conn, { layerId: lower.id, title: 'Rotor system' });
    const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read about lift' });

    return { ownerId, project, upper, parent, child, todo };
};

/**
 * Every endpoint that names a resource, as `[label, method, path, body]`.
 *
 * `GET /api/projects` and `POST /api/projects` are deliberately not here: they
 * name nothing to own. They are covered below, where the question is not "may
 * this user touch it" but "whose rows does this user see".
 */
const scopedEndpoints = (graph) => [
    ['GET /api/projects/:id', 'get', `/api/projects/${graph.project.id}`, undefined],
    ['PATCH /api/projects/:id', 'patch', `/api/projects/${graph.project.id}`, { title: 'Taken' }],
    ['DELETE /api/projects/:id', 'delete', `/api/projects/${graph.project.id}`, undefined],
    ['POST /api/projects/:id/layers', 'post', `/api/projects/${graph.project.id}/layers`, {}],
    [
        'POST /api/projects/:id/todos',
        'post',
        `/api/projects/${graph.project.id}/todos`,
        { text: 'Smuggled in' },
    ],
    ['PATCH /api/layers/:id', 'patch', `/api/layers/${graph.upper.id}`, { title: 'Taken' }],
    ['DELETE /api/layers/:id', 'delete', `/api/layers/${graph.upper.id}`, undefined],
    ['POST /api/layers/:id/sequences', 'post', `/api/layers/${graph.upper.id}/sequences`, {}],
    ['PATCH /api/sequences/:id', 'patch', `/api/sequences/${graph.parent.id}`, { title: 'Taken' }],
    [
        'PUT /api/sequences/:id/move',
        'put',
        `/api/sequences/${graph.parent.id}/move`,
        { layerId: graph.child.layer_id, position: 0 },
    ],
    ['DELETE /api/sequences/:id', 'delete', `/api/sequences/${graph.parent.id}`, undefined],
    ['PATCH /api/todos/:id', 'patch', `/api/todos/${graph.todo.id}`, { text: 'Taken' }],
    [
        'PUT /api/todos/:id/move',
        'put',
        `/api/todos/${graph.todo.id}/move`,
        { sequenceId: null, position: 0 },
    ],
    ['DELETE /api/todos/:id', 'delete', `/api/todos/${graph.todo.id}`, undefined],
];

/** Both endpoints that name no resource. */
const UNSCOPED_ENDPOINTS = [
    ['GET /api/projects', 'get', '/api/projects', undefined],
    ['POST /api/projects', 'post', '/api/projects', { title: 'Mine' }],
];

/**
 * Stand-in ids, used only to read the table's labels out at module load — the
 * real ids are not known until a test has built its fixture.
 */
const SAMPLE_GRAPH = {
    project: { id: 1 },
    upper: { id: 2 },
    parent: { id: 3 },
    child: { id: 4 },
    todo: { id: 5 },
};

const labelsOf = (endpoints) => endpoints.map(([label]) => label);

const SCOPED_LABELS = labelsOf(scopedEndpoints(SAMPLE_GRAPH));

const findEndpoint = (endpoints, label) => endpoints.find(([name]) => name === label);

const send = (method, path, body, header) => {
    const call = request(app)[method](path);

    if (header) call.set('Authorization', header);

    return body === undefined ? call : call.send(body);
};

describe('every endpoint is behind isAuth', () => {
    test.each(labelsOf(UNSCOPED_ENDPOINTS))('%s answers 401 without a token', async (label) => {
        // Arrange
        const [, method, path, body] = findEndpoint(UNSCOPED_ENDPOINTS, label);

        // Act
        const response = await send(method, path, body, null);

        // Assert
        expect(response.status).toBe(401);
    });

    test.each(SCOPED_LABELS)('%s answers 401 without a token', async (label) => {
        // Arrange
        const conn = getConn();
        const graph = await buildGraph(conn);
        const [, method, path, body] = findEndpoint(scopedEndpoints(graph), label);

        // Act
        const response = await send(method, path, body, null);

        // Assert — refused before the resource is ever looked up.
        expect(response.status).toBe(401);
    });
});

describe('no resource is reachable across users', () => {
    test.each(SCOPED_LABELS)('%s answers 403 for another user', async (label) => {
        // Arrange
        const conn = getConn();
        const graph = await buildGraph(conn);
        const intruderId = await createTestUser(conn);
        const [, method, path, body] = findEndpoint(scopedEndpoints(graph), label);

        // Act
        const response = await send(method, path, body, authHeaderFor(intruderId));

        // Assert
        expect(response.status).toBe(403);
    });

    test("GET /api/projects shows a user none of another user's projects", async () => {
        // Arrange
        const conn = getConn();
        const graph = await buildGraph(conn);
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .get('/api/projects')
            .set('Authorization', authHeaderFor(intruderId));

        // Assert — the list is scoped to the caller, so there is nothing to
        // forbid: the owner's project is simply not in it.
        expect(response.status).toBe(200);
        expect(response.body.data.map((project) => project.id)).not.toContain(graph.project.id);
    });
});

/**
 * Sequences are gated by the layer they sit in, not by connections between them,
 * so nothing in the API names a pair of sequences any more.
 *
 * Asserted with the owner's own token, and on the body as well as the status: a
 * handler that refused the request would answer in the API envelope, so only the
 * server's fallthrough body proves there is no handler at all.
 */
const NOT_ROUTED = { error: 'Endpoint not found' };

describe('the edge endpoints are gone from the API surface', () => {
    test('POST /api/projects/:id/edges is not routed', async () => {
        // Arrange
        const conn = getConn();
        const graph = await buildGraph(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${graph.project.id}/edges`)
            .set('Authorization', authHeaderFor(graph.ownerId))
            .send({ parentId: graph.parent.id, childId: graph.child.id });

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_ROUTED);
    });

    test('DELETE /api/projects/:id/edges is not routed', async () => {
        // Arrange
        const conn = getConn();
        const graph = await buildGraph(conn);

        // Act
        const response = await request(app)
            .delete(
                `/api/projects/${graph.project.id}/edges` +
                    `?parentId=${graph.parent.id}&childId=${graph.child.id}`
            )
            .set('Authorization', authHeaderFor(graph.ownerId));

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_ROUTED);
    });
});
