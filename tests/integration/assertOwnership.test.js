'use strict';

const assertOwnership = require('../../src/middleware/assertOwnership');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarNotesRepo = require('../../src/db/repositories/calendarNotesRepo');
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
    const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
    const todo = await todosRepo.create(conn, { projectId: project.id, text: 'A to-do' });

    return { ownerId, project, layer, sequence, todo };
};

const RESOURCE_KEYS = {
    project: 'project',
    layer: 'layer',
    sequence: 'sequence',
    todo: 'todo',
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

describe('assertOwnership(calendarDay)', () => {
    test('returns the day row for its owner', async () => {
        // Arrange — someone else's day goes in first, so a query that forgot to
        // filter by id would hand back theirs and fail here rather than pass by
        // accident on a table this test happens to be alone in.
        const conn = getConn();
        const intruderId = await createTestUser(conn);
        await calendarDaysRepo.create(conn, { ownerId: intruderId });
        const ownerId = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });

        // Act
        const owned = await assertOwnership(conn, 'calendarDay', day.id, ownerId);

        // Assert
        expect(owned.id).toBe(day.id);
        expect(owned.owner_id).toBe(ownerId);
    });

    test('forbids a day belonging to someone else', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId: theirs });

        // Act + Assert
        await expect(assertOwnership(conn, 'calendarDay', day.id, mine)).rejects.toMatchObject({
            status: 403,
        });
    });

    test('reports 404 for a day that does not exist', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act + Assert
        await expect(
            assertOwnership(conn, 'calendarDay', 987654321, ownerId)
        ).rejects.toMatchObject({ status: 404, message: 'Day not found' });
    });
});

describe('assertOwnership calendarNote', () => {
    test('returns the owning day row for the owner', async () => {
        // Arrange — someone else's day and note go in first, so a query that
        // forgot to filter by id would hand back theirs and fail here rather
        // than pass by accident on a table this test happens to be alone in.
        const conn = getConn();
        const intruderId = await createTestUser(conn);
        const intruderDay = await calendarDaysRepo.create(conn, { ownerId: intruderId });
        await calendarNotesRepo.create(conn, {
            dayId: intruderDay.id,
            text: 'not this one',
            startMinutes: 0,
            durationMinutes: 30,
        });
        const ownerId = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const owned = await assertOwnership(conn, 'calendarNote', note.id, ownerId);

        // Assert
        expect(owned.id).toBe(day.id);
        expect(owned.owner_id).toBe(ownerId);
    });

    test('rejects another user’s note', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act & Assert
        await expect(
            assertOwnership(conn, 'calendarNote', note.id, strangerId)
        ).rejects.toMatchObject({ status: 403 });
    });

    test('404s for a note that is not there', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act & Assert
        await expect(
            assertOwnership(conn, 'calendarNote', 999999, ownerId)
        ).rejects.toMatchObject({ status: 404 });
    });
});
