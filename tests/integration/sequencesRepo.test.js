'use strict';

const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/** Builds a project with one layer, the smallest fixture a sequence needs. */
const createLayer = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });

    return { project, layer };
};

describe('sequencesRepo', () => {
    test('appends new sequences at the end of their layer with dense positions', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);

        // Act
        const first = await sequencesRepo.create(conn, {
            layerId: layer.id,
            title: 'Learn aerodynamics',
        });
        const second = await sequencesRepo.create(conn, {
            layerId: layer.id,
            title: 'Learn electronics',
        });

        // Assert
        expect(first.position).toBe(0);
        expect(second.position).toBe(1);
    });

    test('derives project_id from the layer it is created in', async () => {
        // Arrange
        const conn = getConn();
        const { project, layer } = await createLayer(conn);

        // Act
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Assert
        expect(sequence.project_id).toBe(project.id);
    });

    test('falls back to the schema defaults for title and blocked state', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);

        // Act
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Assert
        expect(sequence.title).toBe('Untitled sequence');
        expect(sequence.description).toBeNull();
        expect(sequence.is_blocked).toBe(0);
    });

    test('rejects creating a sequence in a layer that does not exist', async () => {
        await expect(
            sequencesRepo.create(getConn(), { layerId: 987654321 })
        ).rejects.toThrow(/layer 987654321/i);
    });

    test('lists the sequences of one layer in position order', async () => {
        // Arrange
        const conn = getConn();
        const { project, layer } = await createLayer(conn);
        const otherLayer = await layersRepo.create(conn, { projectId: project.id });
        const a = await sequencesRepo.create(conn, { layerId: layer.id, title: 'A' });
        const b = await sequencesRepo.create(conn, { layerId: layer.id, title: 'B' });
        await sequencesRepo.create(conn, { layerId: otherLayer.id, title: 'Elsewhere' });

        // Act
        const sequences = await sequencesRepo.listByLayer(conn, layer.id);

        // Assert
        expect(sequences.map((s) => s.id)).toEqual([a.id, b.id]);
    });

    test('lists every sequence in a project across its layers', async () => {
        // Arrange
        const conn = getConn();
        const { project, layer } = await createLayer(conn);
        const lowerLayer = await layersRepo.create(conn, { projectId: project.id });
        const top = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Top' });
        const lower = await sequencesRepo.create(conn, { layerId: lowerLayer.id, title: 'Lower' });

        // Act
        const sequences = await sequencesRepo.listByProject(conn, project.id);

        // Assert
        expect(sequences.map((s) => s.id).sort()).toEqual([top.id, lower.id].sort());
    });

    test('finds a sequence by id and returns null for an unknown id', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Findable' });

        // Act + Assert
        expect(await sequencesRepo.findById(conn, sequence.id)).toMatchObject({
            title: 'Findable',
        });
        expect(await sequencesRepo.findById(conn, 987654321)).toBeNull();
    });

    test('updates title and description independently', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);
        const sequence = await sequencesRepo.create(conn, {
            layerId: layer.id,
            title: 'Old title',
            description: 'Original description',
        });

        // Act
        const updated = await sequencesRepo.update(conn, sequence.id, { title: 'New title' });

        // Assert
        expect(updated).toMatchObject({
            title: 'New title',
            description: 'Original description',
        });
    });

    test('persists the manual blocked override', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Act
        const blocked = await sequencesRepo.update(conn, sequence.id, { isBlocked: true });
        const unblocked = await sequencesRepo.update(conn, sequence.id, { isBlocked: false });

        // Assert
        expect(blocked.is_blocked).toBe(1);
        expect(unblocked.is_blocked).toBe(0);
    });

    test('rejects an update with no fields to change', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Act + Assert
        await expect(sequencesRepo.update(conn, sequence.id, {})).rejects.toThrow(/no fields/i);
    });

    test('returns null when updating a sequence that does not exist', async () => {
        expect(await sequencesRepo.update(getConn(), 987654321, { title: 'Ghost' })).toBeNull();
    });

    test('closes the position gap left by a deleted sequence', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);
        const left = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Left' });
        const middle = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Middle' });
        const right = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Right' });

        // Act
        const removed = await sequencesRepo.remove(conn, middle.id);

        // Assert
        expect(removed).toBe(true);
        const sequences = await sequencesRepo.listByLayer(conn, layer.id);
        expect(sequences.map((s) => s.id)).toEqual([left.id, right.id]);
        expect(sequences.map((s) => s.position)).toEqual([0, 1]);
    });

    test('reports false when deleting a sequence that does not exist', async () => {
        expect(await sequencesRepo.remove(getConn(), 987654321)).toBe(false);
    });

    test('deletes every sequence belonging to a deleted layer', async () => {
        // Arrange
        const conn = getConn();
        const { layer } = await createLayer(conn);
        const sequence = await sequencesRepo.create(conn, { layerId: layer.id });

        // Act
        await layersRepo.remove(conn, layer.id);

        // Assert
        expect(await sequencesRepo.findById(conn, sequence.id)).toBeNull();
    });

    describe('listByOwner', () => {
        test("returns every sequence across all of the owner's projects", async () => {
            // Arrange — two projects for one owner, one sequence each.
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const first = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
            const second = await projectsRepo.create(conn, { ownerId, title: 'Build a rover' });
            const firstLayer = await layersRepo.create(conn, { projectId: first.id });
            const secondLayer = await layersRepo.create(conn, { projectId: second.id });
            const droneSeq = await sequencesRepo.create(conn, { layerId: firstLayer.id });
            const roverSeq = await sequencesRepo.create(conn, { layerId: secondLayer.id });

            // Act
            const rows = await sequencesRepo.listByOwner(conn, ownerId);

            // Assert
            expect(rows.map((row) => row.id).sort()).toEqual([droneSeq.id, roverSeq.id].sort());
        });

        test("never returns another user's sequences", async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const { layer } = await createLayer(conn);
            await sequencesRepo.create(conn, { layerId: layer.id });

            // Act & Assert — `layer` belongs to a different throwaway user.
            expect(await sequencesRepo.listByOwner(conn, ownerId)).toEqual([]);
        });
    });

});
