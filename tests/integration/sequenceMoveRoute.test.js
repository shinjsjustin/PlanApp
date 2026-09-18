'use strict';

const request = require('supertest');

const app = require('../../src/server');
const { authHeaderFor } = require('../helpers/auth');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * Moving a sequence between layers (spec section 9 of the 2026-09-07 changes).
 *
 * The danger is never the sequence landing in the wrong place. It is the layer
 * it left keeping a hole, or the layer it joined ending up with two sequences
 * claiming one position — a layer's order is what the canvas draws and what the
 * ready frontier reads, so a gap or a collision in it is visible everywhere.
 */

/**
 * The tables one statement names, so a test can say what a move is allowed to
 * touch rather than listing what it must not.
 */
const TABLE_PATTERN = /\b(?:FROM|INTO|JOIN|UPDATE)\s+`?(\w+)`?/gi;

const tablesIn = (sql) => [...sql.matchAll(TABLE_PATTERN)].map(([, table]) => table);

/** Two layers, top to bottom, in one project. */
const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const top = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const middle = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });

    return { ownerId, project, top, middle };
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

    test('touches no table but `sequences`', async () => {
        // Arrange — a cross-layer move, the widest case: it rewrites one column
        // on the moved row and reindexes two layers.
        const conn = getConn();
        const { top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'B' });
        const spy = jest.spyOn(conn, 'execute');
        let tables = [];

        // Act — the statements are read before the spy is restored, which clears
        // them.
        try {
            await sequencesRepo.move(conn, moving.id, { layerId: middle.id, position: 0 });
            tables = spy.mock.calls.flatMap(([sql]) => tablesIn(sql));
        } finally {
            spy.mockRestore();
        }

        // Assert — a sequence's placement is a fact about its layer and nothing
        // else, so a move has no other table to keep in step.
        expect([...new Set(tables)]).toEqual(['sequences']);
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

describe('PUT /api/sequences/:id/move', () => {
    test('moves a sequence to another layer and answers with the new row', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'B' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ layerId: middle.id, position: 0 });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            id: moving.id,
            layerId: middle.id,
            position: 0,
        });
        expect(await layerOrder(conn, middle.id)).toEqual([
            ['A', 0],
            ['B', 1],
        ]);
    });

    test('closes the gap in the layer it left, through the HTTP layer', async () => {
        // Arrange — three sequences up top, one below.
        const conn = getConn();
        const { ownerId, top, middle } = await createFixture(conn);
        await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'B' });
        await sequencesRepo.create(conn, { layerId: top.id, title: 'C' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'D' });

        // Act — B leaves from between A and C.
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ layerId: middle.id, position: 1 });

        // Assert — both layers stay dense, so neither draws a hole.
        expect(response.status).toBe(200);
        expect(await layerOrder(conn, top.id)).toEqual([
            ['A', 0],
            ['C', 1],
        ]);
        expect(await layerOrder(conn, middle.id)).toEqual([
            ['D', 0],
            ['B', 1],
        ]);
    });

    test('answers 400 for a position past the end of the target layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ layerId: middle.id, position: 9 });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/position/);
        expect(await layerOrder(conn, top.id)).toEqual([['A', 0]]);
    });

    test('answers 400 for a layer in a different project', async () => {
        // Arrange — the same owner, two projects.
        const conn = getConn();
        const { ownerId, top } = await createFixture(conn);
        const other = await projectsRepo.create(conn, { ownerId, title: 'Other plan' });
        const foreignLayer = await layersRepo.create(conn, {
            projectId: other.id,
            title: 'Elsewhere',
        });
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ layerId: foreignLayer.id, position: 0 });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/not in this project/);
    });

    test('answers 403 for a sequence belonging to someone else', async () => {
        // Arrange
        const conn = getConn();
        const { top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        const stranger = await createTestUser(conn, { email: 'stranger@example.com' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(stranger))
            .send({ layerId: middle.id, position: 0 });

        // Assert
        expect(response.status).toBe(403);
    });

    test('answers 400 when the body names no layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, top } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ position: 0 });

        // Assert
        expect(response.status).toBe(400);
    });
});
