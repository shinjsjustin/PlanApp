'use strict';

const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

describe('projectsRepo', () => {
    test('creates a project owned by the given user and returns the stored row', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const project = await projectsRepo.create(conn, {
            ownerId,
            title: 'Build a drone',
            description: 'Layered plan',
        });

        // Assert
        expect(project).toMatchObject({
            owner_id: ownerId,
            title: 'Build a drone',
            description: 'Layered plan',
        });
        expect(project.id).toEqual(expect.any(Number));
    });

    test('stores a null description when none is given', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const project = await projectsRepo.create(conn, { ownerId, title: 'No description' });

        // Assert
        expect(project.description).toBeNull();
    });

    test('finds a project by id', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await projectsRepo.create(conn, { ownerId, title: 'Findable' });

        // Act
        const found = await projectsRepo.findById(conn, created.id);

        // Assert
        expect(found).toMatchObject({ id: created.id, title: 'Findable' });
    });

    test('returns null when the project id does not exist', async () => {
        expect(await projectsRepo.findById(getConn(), 987654321)).toBeNull();
    });

    test('lists only the projects owned by the given user, newest first', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherOwnerId = await createTestUser(conn);
        const first = await projectsRepo.create(conn, { ownerId, title: 'Mine A' });
        const second = await projectsRepo.create(conn, { ownerId, title: 'Mine B' });
        await projectsRepo.create(conn, { ownerId: otherOwnerId, title: 'Theirs' });

        // Act
        const mine = await projectsRepo.listByOwner(conn, ownerId);

        // Assert
        expect(mine.map((p) => p.id)).toEqual([second.id, first.id]);
    });

    test('updates only the fields that are provided', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await projectsRepo.create(conn, {
            ownerId,
            title: 'Original title',
            description: 'Original description',
        });

        // Act
        const updated = await projectsRepo.update(conn, created.id, { title: 'New title' });

        // Assert
        expect(updated).toMatchObject({
            id: created.id,
            title: 'New title',
            description: 'Original description',
        });
    });

    test('rejects an update with no fields to change', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await projectsRepo.create(conn, { ownerId, title: 'Untouched' });

        // Act + Assert
        await expect(projectsRepo.update(conn, created.id, {})).rejects.toThrow(/no fields/i);
    });

    test('returns null when updating a project that does not exist', async () => {
        expect(await projectsRepo.update(getConn(), 987654321, { title: 'Ghost' })).toBeNull();
    });

    test('deletes a project and reports whether a row was removed', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await projectsRepo.create(conn, { ownerId, title: 'Doomed' });

        // Act
        const deleted = await projectsRepo.remove(conn, created.id);

        // Assert
        expect(deleted).toBe(true);
        expect(await projectsRepo.findById(conn, created.id)).toBeNull();
        expect(await projectsRepo.remove(conn, created.id)).toBe(false);
    });

    test('deletes every project belonging to a deleted user', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await projectsRepo.create(conn, { ownerId, title: 'Owned' });

        // Act
        await conn.execute('DELETE FROM users WHERE id = ?', [ownerId]);

        // Assert
        expect(await projectsRepo.findById(conn, created.id)).toBeNull();
    });
});
