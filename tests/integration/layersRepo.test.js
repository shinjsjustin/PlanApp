'use strict';

const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const createProject = async (conn) => {
    const ownerId = await createTestUser(conn);
    return projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
};

const positionsOf = (layers) => layers.map((layer) => layer.position);

describe('layersRepo', () => {
    test('appends new layers at the end with dense positions', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);

        // Act
        const first = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
        const second = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });

        // Assert
        expect(first.position).toBe(0);
        expect(second.position).toBe(1);
    });

    test('falls back to the schema default title', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);

        // Act
        const layer = await layersRepo.create(conn, { projectId: project.id });

        // Assert
        expect(layer.title).toBe('Untitled layer');
    });

    test('inserts directly below the given layer and reindexes the rest', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);
        const top = await layersRepo.create(conn, { projectId: project.id, title: 'Top' });
        const bottom = await layersRepo.create(conn, { projectId: project.id, title: 'Bottom' });

        // Act
        const middle = await layersRepo.create(conn, {
            projectId: project.id,
            title: 'Middle',
            afterLayerId: top.id,
        });

        // Assert
        const layers = await layersRepo.listByProject(conn, project.id);
        expect(layers.map((l) => l.id)).toEqual([top.id, middle.id, bottom.id]);
        expect(positionsOf(layers)).toEqual([0, 1, 2]);
    });

    test('rejects inserting after a layer that belongs to another project', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);
        const otherProject = await createProject(conn);
        const foreignLayer = await layersRepo.create(conn, { projectId: otherProject.id });

        // Act + Assert
        await expect(
            layersRepo.create(conn, { projectId: project.id, afterLayerId: foreignLayer.id })
        ).rejects.toThrow(/not in project/i);
    });

    test('lists a project layers ordered by position', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);
        const a = await layersRepo.create(conn, { projectId: project.id, title: 'A' });
        const b = await layersRepo.create(conn, { projectId: project.id, title: 'B' });

        // Act
        const layers = await layersRepo.listByProject(conn, project.id);

        // Assert
        expect(layers.map((l) => l.title)).toEqual(['A', 'B']);
        expect(layers.map((l) => l.id)).toEqual([a.id, b.id]);
    });

    test('does not list layers from another project', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);
        const otherProject = await createProject(conn);
        await layersRepo.create(conn, { projectId: otherProject.id, title: 'Theirs' });

        // Act
        const layers = await layersRepo.listByProject(conn, project.id);

        // Assert
        expect(layers).toEqual([]);
    });

    test('finds a layer by id and returns null for an unknown id', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);
        const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Findable' });

        // Act + Assert
        expect(await layersRepo.findById(conn, layer.id)).toMatchObject({ title: 'Findable' });
        expect(await layersRepo.findById(conn, 987654321)).toBeNull();
    });

    test('renames a layer', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);
        const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Old' });

        // Act
        const updated = await layersRepo.update(conn, layer.id, { title: 'New' });

        // Assert
        expect(updated).toMatchObject({ id: layer.id, title: 'New' });
    });

    test('returns null when renaming a layer that does not exist', async () => {
        expect(await layersRepo.update(getConn(), 987654321, { title: 'Ghost' })).toBeNull();
    });

    test('closes the position gap left by a deleted layer', async () => {
        // Arrange
        const conn = getConn();
        const project = await createProject(conn);
        const top = await layersRepo.create(conn, { projectId: project.id, title: 'Top' });
        const middle = await layersRepo.create(conn, { projectId: project.id, title: 'Middle' });
        const bottom = await layersRepo.create(conn, { projectId: project.id, title: 'Bottom' });

        // Act
        const removed = await layersRepo.remove(conn, middle.id);

        // Assert
        expect(removed).toBe(true);
        const layers = await layersRepo.listByProject(conn, project.id);
        expect(layers.map((l) => l.id)).toEqual([top.id, bottom.id]);
        expect(positionsOf(layers)).toEqual([0, 1]);
    });

    test('reports false when deleting a layer that does not exist', async () => {
        expect(await layersRepo.remove(getConn(), 987654321)).toBe(false);
    });
});
