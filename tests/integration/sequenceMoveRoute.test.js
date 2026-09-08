'use strict';

const edgesRepo = require('../../src/db/repositories/edgesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * Moving a sequence between layers (spec section 9 of the 2026-09-07 changes).
 *
 * The danger is never the sequence landing in the wrong place. It is the layer
 * it left keeping a hole, the layer it joined ending up with two sequences
 * claiming one position, or an edge surviving the move pointing upward — which
 * would break the one invariant the whole graph rests on, that every edge steps
 * strictly down a layer and so no chain can ever cycle.
 */

/** Three layers, top to bottom, in one project. */
const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const top = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const middle = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
    const bottom = await layersRepo.create(conn, { projectId: project.id, title: 'Build' });

    return { ownerId, project, top, middle, bottom };
};

/** One layer's sequences as `[title, position]` pairs, left to right. */
const layerOrder = async (conn, layerId) => {
    const sequences = await sequencesRepo.listByLayer(conn, layerId);

    return sequences.map((sequence) => [sequence.title, sequence.position]);
};

describe('sequencesRepo.move', () => {
    test('files a sequence into another layer, leaving both layers dense', async () => {
        // Arrange — two sequences up top, two below.
        const conn = getConn();
        const { project, top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: top.id, title: 'B' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'C' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'D' });

        // Act — A goes to the middle layer, between C and D.
        const moved = await sequencesRepo.move(conn, moving.id, {
            layerId: middle.id,
            position: 1,
        });

        // Assert
        expect(moved.layer_id).toBe(middle.id);
        expect(moved.project_id).toBe(project.id);
        expect(await layerOrder(conn, top.id)).toEqual([['B', 0]]);
        expect(await layerOrder(conn, middle.id)).toEqual([
            ['C', 0],
            ['A', 1],
            ['D', 2],
        ]);
    });

    test('reorders within one layer without touching the others', async () => {
        // Arrange
        const conn = getConn();
        const { top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: top.id, title: 'B' });
        await sequencesRepo.create(conn, { layerId: top.id, title: 'C' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'D' });

        // Act — A moves to the end of its own layer.
        await sequencesRepo.move(conn, moving.id, { layerId: top.id, position: 2 });

        // Assert
        expect(await layerOrder(conn, top.id)).toEqual([
            ['B', 0],
            ['C', 1],
            ['A', 2],
        ]);
        expect(await layerOrder(conn, middle.id)).toEqual([['D', 0]]);
    });

    test('deletes edges the move would leave pointing upward', async () => {
        // Arrange — parent up top feeding a child in the middle layer.
        const conn = getConn();
        const { project, top, middle, bottom } = await createFixture(conn);
        const parent = await sequencesRepo.create(conn, { layerId: top.id, title: 'Parent' });
        const child = await sequencesRepo.create(conn, { layerId: middle.id, title: 'Child' });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act — the parent drops BELOW its child, which the edge cannot survive.
        await sequencesRepo.move(conn, parent.id, { layerId: bottom.id, position: 0 });

        // Assert
        expect(await edgesRepo.listByProject(conn, project.id)).toEqual([]);
    });

    test('keeps edges that still point downward after the move', async () => {
        // Arrange — parent up top, child at the bottom, one layer of slack.
        const conn = getConn();
        const { project, top, middle, bottom } = await createFixture(conn);
        const parent = await sequencesRepo.create(conn, { layerId: top.id, title: 'Parent' });
        const child = await sequencesRepo.create(conn, { layerId: bottom.id, title: 'Child' });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act — the parent moves down one layer and is still above the child.
        await sequencesRepo.move(conn, parent.id, { layerId: middle.id, position: 0 });

        // Assert
        const edges = await edgesRepo.listByProject(conn, project.id);
        expect(edges).toHaveLength(1);
        expect(edges[0].parent_id).toBe(parent.id);
    });

    test('deletes an edge that a move into the child’s own layer invalidates', async () => {
        // Arrange — same-layer pairs are parallel work; neither gates the other.
        const conn = getConn();
        const { project, top, middle } = await createFixture(conn);
        const parent = await sequencesRepo.create(conn, { layerId: top.id, title: 'Parent' });
        const child = await sequencesRepo.create(conn, { layerId: middle.id, title: 'Child' });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act
        await sequencesRepo.move(conn, parent.id, { layerId: middle.id, position: 0 });

        // Assert
        expect(await edgesRepo.listByProject(conn, project.id)).toEqual([]);
    });

    test('rejects a position past the end of the target layer, writing nothing', async () => {
        // Arrange
        const conn = getConn();
        const { top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'B' });

        // Act & Assert — the target layer holds one sequence, so 0 and 1 are the
        // only legal slots for one joining it.
        await expect(
            sequencesRepo.move(conn, moving.id, { layerId: middle.id, position: 5 })
        ).rejects.toThrow(RangeError);

        // The sequence is still where it was, and both layers are untouched.
        expect(await layerOrder(conn, top.id)).toEqual([['A', 0]]);
        expect(await layerOrder(conn, middle.id)).toEqual([['B', 0]]);
    });

    test('returns null for a sequence that does not exist', async () => {
        // Arrange
        const conn = getConn();
        const { middle } = await createFixture(conn);

        // Act
        const moved = await sequencesRepo.move(conn, 999999, {
            layerId: middle.id,
            position: 0,
        });

        // Assert
        expect(moved).toBeNull();
    });
});
