'use strict';

const assertOwnership = require('../../src/middleware/assertOwnership');
const edgesRepo = require('../../src/db/repositories/edgesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * Builds one of everything under a single project, so each resource type can be
 * resolved back up to the same owner.
 */
const buildGraph = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Owned' });
    const layer = await layersRepo.create(conn, { projectId: project.id });
    const parent = await sequencesRepo.create(conn, { layerId: layer.id });
    const child = await sequencesRepo.create(conn, { layerId: layer.id });
    const todo = await todosRepo.create(conn, { projectId: project.id, text: 'A to-do' });
    const edge = await edgesRepo.create(conn, {
        projectId: project.id,
        parentId: parent.id,
        childId: child.id,
    });

    return { ownerId, project, layer, sequence: parent, todo, edge };
};

const RESOURCE_KEYS = {
    project: 'project',
    layer: 'layer',
    sequence: 'sequence',
    todo: 'todo',
    edge: 'edge',
};

describe('assertOwnership', () => {
    test.each(Object.keys(RESOURCE_KEYS))(
        'resolves a %s up to its owning project',
        async (resourceType) => {
            // Arrange
            const conn = getConn();
            const graph = await buildGraph(conn);

            // Act
            const project = await assertOwnership(
                conn,
                resourceType,
                graph[RESOURCE_KEYS[resourceType]].id,
                graph.ownerId
            );

            // Assert
            expect(project).toMatchObject({ id: graph.project.id, owner_id: graph.ownerId });
        }
    );

    test.each(Object.keys(RESOURCE_KEYS))(
        'throws 403 when a %s belongs to another user',
        async (resourceType) => {
            // Arrange
            const conn = getConn();
            const graph = await buildGraph(conn);
            const intruderId = await createTestUser(conn);

            // Act + Assert
            await expect(
                assertOwnership(
                    conn,
                    resourceType,
                    graph[RESOURCE_KEYS[resourceType]].id,
                    intruderId
                )
            ).rejects.toMatchObject({ status: 403 });
        }
    );

    test.each(Object.keys(RESOURCE_KEYS))(
        'throws 404 when the %s does not exist',
        async (resourceType) => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);

            // Act + Assert
            await expect(
                assertOwnership(conn, resourceType, 987654321, ownerId)
            ).rejects.toMatchObject({ status: 404 });
        }
    );

    test('rejects an unknown resource type rather than guessing', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act + Assert
        await expect(assertOwnership(conn, 'widget', 1, ownerId)).rejects.toThrow(/widget/i);
    });
});
