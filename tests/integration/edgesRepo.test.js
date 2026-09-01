'use strict';

const edgesRepo = require('../../src/db/repositories/edgesRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * Builds the smallest shape an edge needs: a project with two stacked layers,
 * one sequence in each. `parent` sits above `child`.
 */
const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const upperLayer = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const lowerLayer = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
    const parent = await sequencesRepo.create(conn, {
        layerId: upperLayer.id,
        title: 'Learn aerodynamics',
    });
    const child = await sequencesRepo.create(conn, {
        layerId: lowerLayer.id,
        title: 'Design rotor system',
    });

    return { project, upperLayer, lowerLayer, parent, child };
};

describe('edgesRepo', () => {
    test('creates an edge from a parent sequence to a child sequence', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);

        // Act
        const edge = await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Assert
        expect(edge).toMatchObject({
            project_id: project.id,
            parent_id: parent.id,
            child_id: child.id,
        });
        expect(edge.id).toEqual(expect.any(Number));
    });

    test('rejects a duplicate parent-child pair', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act + Assert
        await expect(
            edgesRepo.create(conn, {
                projectId: project.id,
                parentId: parent.id,
                childId: child.id,
            })
        ).rejects.toThrow(/already connected/i);
    });

    test('treats the reversed pair as a different edge', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act
        const reversed = await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: child.id,
            childId: parent.id,
        });

        // Assert
        expect(reversed).toMatchObject({ parent_id: child.id, child_id: parent.id });
    });

    test('finds an edge by its parent and child, or null when absent', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);

        // Act + Assert
        expect(await edgesRepo.findByPair(conn, parent.id, child.id)).toBeNull();

        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        expect(await edgesRepo.findByPair(conn, parent.id, child.id)).toMatchObject({
            parent_id: parent.id,
            child_id: child.id,
        });
    });

    test('lists the edges of one project only', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);
        const other = await createFixture(conn);
        const edge = await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });
        await edgesRepo.create(conn, {
            projectId: other.project.id,
            parentId: other.parent.id,
            childId: other.child.id,
        });

        // Act
        const edges = await edgesRepo.listByProject(conn, project.id);

        // Assert
        expect(edges.map((e) => e.id)).toEqual([edge.id]);
    });

    test('removes an edge by its parent and child', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act
        const removed = await edgesRepo.remove(conn, parent.id, child.id);

        // Assert
        expect(removed).toBe(true);
        expect(await edgesRepo.findByPair(conn, parent.id, child.id)).toBeNull();
    });

    test('reports false when removing an edge that does not exist', async () => {
        // Arrange
        const conn = getConn();
        const { parent, child } = await createFixture(conn);

        // Act + Assert
        expect(await edgesRepo.remove(conn, parent.id, child.id)).toBe(false);
    });

    test('deletes edges where the deleted sequence was the parent', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act
        await sequencesRepo.remove(conn, parent.id);

        // Assert
        expect(await edgesRepo.listByProject(conn, project.id)).toEqual([]);
    });

    test('deletes edges where the deleted sequence was the child', async () => {
        // Arrange
        const conn = getConn();
        const { project, parent, child } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act
        await sequencesRepo.remove(conn, child.id);

        // Assert
        expect(await edgesRepo.listByProject(conn, project.id)).toEqual([]);
    });

    describe('listByOwner', () => {
        test("returns every edge across all of the owner's projects", async () => {
            // Arrange
            const conn = getConn();
            const { project, parent, child } = await createFixture(conn);
            const created = await edgesRepo.create(conn, {
                projectId: project.id,
                parentId: parent.id,
                childId: child.id,
            });

            // Act
            const rows = await edgesRepo.listByOwner(conn, project.owner_id);

            // Assert
            expect(rows.map((row) => row.id)).toEqual([created.id]);
        });

        test("never returns another user's edges", async () => {
            // Arrange
            const conn = getConn();
            const strangerId = await createTestUser(conn);
            const { project, parent, child } = await createFixture(conn);
            await edgesRepo.create(conn, {
                projectId: project.id,
                parentId: parent.id,
                childId: child.id,
            });

            // Act & Assert
            expect(await edgesRepo.listByOwner(conn, strangerId)).toEqual([]);
        });
    });

});
