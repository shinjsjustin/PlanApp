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
 * `GET /api/projects/:id` — the one payload the project page loads (spec 4.4).
 * Everything the canvas needs arrives together, so the client never fans out a
 * request per layer or per sequence.
 */

/**
 * The spec's worked example, small enough to assert on in full: a `learning`
 * layer feeding a `design` layer, one unorganized to-do left over.
 */
const buildDroneProject = async (conn, ownerId) => {
    const project = await projectsRepo.create(conn, {
        ownerId,
        title: 'Build a drone',
        description: 'Layered plan',
    });

    const learning = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const design = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });

    const aerodynamics = await sequencesRepo.create(conn, {
        layerId: learning.id,
        title: 'Learn aerodynamics',
    });
    const electronics = await sequencesRepo.create(conn, {
        layerId: learning.id,
        title: 'Learn electronics',
    });
    const rotor = await sequencesRepo.create(conn, {
        layerId: design.id,
        title: 'Design rotor system',
    });

    const edge = await edgesRepo.create(conn, {
        projectId: project.id,
        parentId: aerodynamics.id,
        childId: rotor.id,
    });

    const organized = await todosRepo.create(conn, {
        projectId: project.id,
        sequenceId: aerodynamics.id,
        text: 'Read about lift',
    });
    const unorganized = await todosRepo.create(conn, {
        projectId: project.id,
        text: 'Buy a soldering iron',
    });

    return {
        project,
        learning,
        design,
        aerodynamics,
        electronics,
        rotor,
        edge,
        organized,
        unorganized,
    };
};

const fetchGraph = (projectId, ownerId) =>
    request(app).get(`/api/projects/${projectId}`).set('Authorization', authHeaderFor(ownerId));

describe('GET /api/projects/:id', () => {
    test('returns the project with its to-do counts', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project } = await buildDroneProject(conn, ownerId);

        // Act
        const response = await fetchGraph(project.id, ownerId);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, error: null });
        expect(response.body.data.project).toMatchObject({
            id: project.id,
            title: 'Build a drone',
            description: 'Layered plan',
            todoCount: 2,
            completedTodoCount: 0,
        });
    });

    test('returns the layers ordered top to bottom by position', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, learning, design } = await buildDroneProject(conn, ownerId);

        // Act
        const { body } = await fetchGraph(project.id, ownerId);

        // Assert
        expect(body.data.layers).toEqual([
            expect.objectContaining({ id: learning.id, title: 'Learning', position: 0 }),
            expect.objectContaining({ id: design.id, title: 'Design', position: 1 }),
        ]);
    });

    test('returns every sequence in the project, keyed to its layer', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, learning, design, aerodynamics, electronics, rotor } =
            await buildDroneProject(conn, ownerId);

        // Act
        const { body } = await fetchGraph(project.id, ownerId);

        // Assert
        expect(body.data.sequences).toEqual([
            expect.objectContaining({
                id: aerodynamics.id,
                layerId: learning.id,
                title: 'Learn aerodynamics',
                position: 0,
                isBlocked: false,
            }),
            expect.objectContaining({ id: electronics.id, layerId: learning.id, position: 1 }),
            expect.objectContaining({ id: rotor.id, layerId: design.id, position: 0 }),
        ]);
    });

    test('returns the edges as parent/child pairs', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, aerodynamics, rotor, edge } = await buildDroneProject(conn, ownerId);

        // Act
        const { body } = await fetchGraph(project.id, ownerId);

        // Assert
        expect(body.data.edges).toEqual([
            expect.objectContaining({
                id: edge.id,
                parentId: aerodynamics.id,
                childId: rotor.id,
            }),
        ]);
    });

    test('returns organized and unorganized to-dos in the same collection', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, aerodynamics, organized, unorganized } = await buildDroneProject(
            conn,
            ownerId
        );

        // Act
        const { body } = await fetchGraph(project.id, ownerId);

        // Assert — the unorganized panel is a `sequenceId === null` filter, not
        // a separate collection (spec 4.2).
        expect(body.data.todos).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: organized.id,
                    sequenceId: aerodynamics.id,
                    text: 'Read about lift',
                    status: 'incomplete',
                }),
                expect.objectContaining({ id: unorganized.id, sequenceId: null }),
            ])
        );
        expect(body.data.todos).toHaveLength(2);
    });

    test('returns empty collections for a project with nothing in it', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'Brand new' });

        // Act
        const { body } = await fetchGraph(project.id, ownerId);

        // Assert
        expect(body.data).toMatchObject({ layers: [], sequences: [], edges: [], todos: [] });
    });

    test('never leaks another user\'s project through the graph payload', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const theirs = await buildDroneProject(conn, otherId);

        // Act
        const response = await fetchGraph(theirs.project.id, ownerId);

        // Assert
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ success: false, data: null });
    });

    test('returns 404 for a project that does not exist', async () => {
        // Arrange
        const ownerId = await createTestUser(getConn());

        // Act & Assert
        expect((await fetchGraph(987654321, ownerId)).status).toBe(404);
    });

    test('returns 400 for a non-numeric id', async () => {
        // Arrange
        const ownerId = await createTestUser(getConn());

        // Act & Assert
        expect((await fetchGraph('not-a-number', ownerId)).status).toBe(400);
    });

    test('costs the same number of queries however many layers and sequences there are', async () => {
        // Arrange — a two-layer project and a five-layer one with sequences in
        // each. A per-layer or per-sequence query would make the second cost
        // more; a batched read costs the same (spec 4.4, "no N+1").
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const small = await buildDroneProject(conn, ownerId);

        const large = await projectsRepo.create(conn, { ownerId, title: 'Much bigger' });
        for (let i = 0; i < 5; i += 1) {
            const layer = await layersRepo.create(conn, { projectId: large.id });
            for (let j = 0; j < 4; j += 1) {
                await sequencesRepo.create(conn, { layerId: layer.id });
            }
        }

        const countQueries = async (projectId) => {
            const spy = jest.spyOn(conn, 'execute');
            try {
                const response = await fetchGraph(projectId, ownerId);
                expect(response.status).toBe(200);
                return spy.mock.calls.length;
            } finally {
                spy.mockRestore();
            }
        };

        // Act
        const smallCost = await countQueries(small.project.id);
        const largeCost = await countQueries(large.id);

        // Assert
        expect(largeCost).toBe(smallCost);
    });
});
