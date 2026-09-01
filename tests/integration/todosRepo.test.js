'use strict';

const todosRepo = require('../../src/db/repositories/todosRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/** Builds a project with one layer and one sequence in it. */
const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const sequence = await sequencesRepo.create(conn, {
        layerId: layer.id,
        title: 'Learn aerodynamics',
    });

    return { project, layer, sequence };
};

const idsOf = (todos) => todos.map((todo) => todo.id);
const positionsOf = (todos) => todos.map((todo) => todo.position);

describe('todosRepo', () => {
    test('creates an unorganized to-do when no sequence is given', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);

        // Act
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read a book' });

        // Assert
        expect(todo).toMatchObject({
            project_id: project.id,
            sequence_id: null,
            text: 'Read a book',
            status: 'incomplete',
            position: 0,
        });
    });

    test('appends to-dos to the end of the unorganized list', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);

        // Act
        await todosRepo.create(conn, { projectId: project.id, text: 'First' });
        const second = await todosRepo.create(conn, { projectId: project.id, text: 'Second' });

        // Assert
        expect(second.position).toBe(1);
    });

    test('appends to-dos to the end of a sequence, numbered independently', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        await todosRepo.create(conn, { projectId: project.id, text: 'Unorganized' });

        // Act
        const inSequence = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Lift and drag',
        });

        // Assert
        expect(inSequence.sequence_id).toBe(sequence.id);
        expect(inSequence.position).toBe(0);
    });

    test('lists the unorganized to-dos of a project in position order', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const a = await todosRepo.create(conn, { projectId: project.id, text: 'A' });
        const b = await todosRepo.create(conn, { projectId: project.id, text: 'B' });
        await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Organized',
        });

        // Act
        const unorganized = await todosRepo.listUnorganized(conn, project.id);

        // Assert
        expect(idsOf(unorganized)).toEqual([a.id, b.id]);
    });

    test('lists the to-dos of one sequence in position order', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const a = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'A',
        });
        const b = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'B',
        });
        await todosRepo.create(conn, { projectId: project.id, text: 'Unorganized' });

        // Act
        const todos = await todosRepo.listBySequence(conn, sequence.id);

        // Assert
        expect(idsOf(todos)).toEqual([a.id, b.id]);
    });

    test('lists every to-do in a project, organized or not', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const loose = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        const filed = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed',
        });

        // Act
        const todos = await todosRepo.listByProject(conn, project.id);

        // Assert
        expect(idsOf(todos).sort()).toEqual([loose.id, filed.id].sort());
    });

    test('finds a to-do by id and returns null for an unknown id', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Findable' });

        // Act + Assert
        expect(await todosRepo.findById(conn, todo.id)).toMatchObject({ text: 'Findable' });
        expect(await todosRepo.findById(conn, 987654321)).toBeNull();
    });

    test('updates text and status independently', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Old text' });

        // Act
        const retexted = await todosRepo.update(conn, todo.id, { text: 'New text' });
        const completed = await todosRepo.update(conn, todo.id, { status: 'complete' });

        // Assert
        expect(retexted).toMatchObject({ text: 'New text', status: 'incomplete' });
        expect(completed).toMatchObject({ text: 'New text', status: 'complete' });
    });

    test('rejects an update with no fields to change', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Untouched' });

        // Act + Assert
        await expect(todosRepo.update(conn, todo.id, {})).rejects.toThrow(/no fields/i);
    });

    test('returns null when updating a to-do that does not exist', async () => {
        expect(await todosRepo.update(getConn(), 987654321, { text: 'Ghost' })).toBeNull();
    });

    test('reorders a to-do within its own list', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const a = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'A',
        });
        const b = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'B',
        });
        const c = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'C',
        });

        // Act
        await todosRepo.move(conn, c.id, { sequenceId: sequence.id, position: 0 });

        // Assert
        const todos = await todosRepo.listBySequence(conn, sequence.id);
        expect(idsOf(todos)).toEqual([c.id, a.id, b.id]);
        expect(positionsOf(todos)).toEqual([0, 1, 2]);
    });

    test('moves an unorganized to-do into a sequence and closes the gap it left', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const first = await todosRepo.create(conn, { projectId: project.id, text: 'First' });
        const dragged = await todosRepo.create(conn, { projectId: project.id, text: 'Dragged' });
        const last = await todosRepo.create(conn, { projectId: project.id, text: 'Last' });
        const existing = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Already here',
        });

        // Act
        const moved = await todosRepo.move(conn, dragged.id, {
            sequenceId: sequence.id,
            position: 0,
        });

        // Assert
        expect(moved).toMatchObject({ sequence_id: sequence.id, position: 0 });

        const inSequence = await todosRepo.listBySequence(conn, sequence.id);
        expect(idsOf(inSequence)).toEqual([dragged.id, existing.id]);
        expect(positionsOf(inSequence)).toEqual([0, 1]);

        const unorganized = await todosRepo.listUnorganized(conn, project.id);
        expect(idsOf(unorganized)).toEqual([first.id, last.id]);
        expect(positionsOf(unorganized)).toEqual([0, 1]);
    });

    test('moves a to-do out of a sequence back to the unorganized list', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const loose = await todosRepo.create(conn, { projectId: project.id, text: 'Loose' });
        const filed = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed',
        });

        // Act
        const moved = await todosRepo.move(conn, filed.id, { sequenceId: null, position: 1 });

        // Assert
        expect(moved.sequence_id).toBeNull();
        expect(idsOf(await todosRepo.listUnorganized(conn, project.id))).toEqual([
            loose.id,
            filed.id,
        ]);
        expect(await todosRepo.listBySequence(conn, sequence.id)).toEqual([]);
    });

    test('returns null when moving a to-do that does not exist', async () => {
        expect(
            await todosRepo.move(getConn(), 987654321, { sequenceId: null, position: 0 })
        ).toBeNull();
    });

    test('rejects a move to a position past the end of the target list', async () => {
        // Arrange
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Dragged' });

        // Act + Assert
        await expect(
            todosRepo.move(conn, todo.id, { sequenceId: sequence.id, position: 5 })
        ).rejects.toThrow(RangeError);
    });

    test('rejects a move into a sequence belonging to another project', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const other = await createFixture(conn);
        const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Dragged' });

        // Act + Assert
        await expect(
            todosRepo.move(conn, todo.id, { sequenceId: other.sequence.id, position: 0 })
        ).rejects.toThrow(/not in project/i);
    });

    test('closes the position gap left by a deleted to-do', async () => {
        // Arrange
        const conn = getConn();
        const { project } = await createFixture(conn);
        const a = await todosRepo.create(conn, { projectId: project.id, text: 'A' });
        const b = await todosRepo.create(conn, { projectId: project.id, text: 'B' });
        const c = await todosRepo.create(conn, { projectId: project.id, text: 'C' });

        // Act
        const removed = await todosRepo.remove(conn, b.id);

        // Assert
        expect(removed).toBe(true);
        const unorganized = await todosRepo.listUnorganized(conn, project.id);
        expect(idsOf(unorganized)).toEqual([a.id, c.id]);
        expect(positionsOf(unorganized)).toEqual([0, 1]);
    });

    test('reports false when deleting a to-do that does not exist', async () => {
        expect(await todosRepo.remove(getConn(), 987654321)).toBe(false);
    });

    // -- The completion stamp ---------------------------------------------
    //
    // `completed_at` is derived by the repository from the status transition,
    // never sent by a caller: the DONE group on a sequence card dates its rows
    // from it, so it has to be the moment of the tick.

    describe('the completion stamp', () => {
        test('leaves a new to-do with no completion stamp', async () => {
            // Arrange
            const conn = getConn();
            const { project } = await createFixture(conn);

            // Act
            const todo = await todosRepo.create(conn, {
                projectId: project.id,
                text: 'Read about lift',
            });

            // Assert
            expect(todo.completed_at).toBeNull();
        });

        test('stamps it when a to-do is ticked complete', async () => {
            // Arrange
            const conn = getConn();
            const { project } = await createFixture(conn);
            const todo = await todosRepo.create(conn, {
                projectId: project.id,
                text: 'Read about lift',
            });

            // Act
            const completed = await todosRepo.update(conn, todo.id, { status: 'complete' });

            // Assert
            expect(completed.completed_at).toBeInstanceOf(Date);
        });

        test('clears it when a to-do is un-ticked', async () => {
            // Arrange
            const conn = getConn();
            const { project } = await createFixture(conn);
            const todo = await todosRepo.create(conn, {
                projectId: project.id,
                text: 'Read about lift',
            });
            await todosRepo.update(conn, todo.id, { status: 'complete' });

            // Act
            const reopened = await todosRepo.update(conn, todo.id, { status: 'incomplete' });

            // Assert
            expect(reopened.completed_at).toBeNull();
        });

        test('clears it when a completed to-do is blocked instead', async () => {
            // Arrange
            const conn = getConn();
            const { project } = await createFixture(conn);
            const todo = await todosRepo.create(conn, {
                projectId: project.id,
                text: 'Read about lift',
            });
            await todosRepo.update(conn, todo.id, { status: 'complete' });

            // Act
            const blocked = await todosRepo.update(conn, todo.id, { status: 'blocked' });

            // Assert
            expect(blocked.completed_at).toBeNull();
        });

        // Renaming a finished to-do must not re-date it — which is the whole
        // reason `updated_at` could not stand in for this column.
        test('leaves the stamp alone when only the text changes', async () => {
            // Arrange
            const conn = getConn();
            const { project } = await createFixture(conn);
            const todo = await todosRepo.create(conn, {
                projectId: project.id,
                text: 'Read about lift',
            });
            const completed = await todosRepo.update(conn, todo.id, { status: 'complete' });

            // Act
            const renamed = await todosRepo.update(conn, todo.id, { text: 'Read about drag' });

            // Assert
            expect(renamed.completed_at).toEqual(completed.completed_at);
        });

        test('leaves the stamp alone when the status it already has is re-sent', async () => {
            // Arrange
            const conn = getConn();
            const { project } = await createFixture(conn);
            const todo = await todosRepo.create(conn, {
                projectId: project.id,
                text: 'Read about lift',
            });
            const completed = await todosRepo.update(conn, todo.id, { status: 'complete' });

            // Act
            const again = await todosRepo.update(conn, todo.id, { status: 'complete' });

            // Assert
            expect(again.completed_at).toEqual(completed.completed_at);
        });
    });

    describe('listByOwner', () => {
        test("returns filed and unorganized to-dos across all of the owner's projects", async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const first = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
            const second = await projectsRepo.create(conn, { ownerId, title: 'Build a rover' });
            const layer = await layersRepo.create(conn, { projectId: first.id });
            const sequence = await sequencesRepo.create(conn, { layerId: layer.id });
            const filed = await todosRepo.create(conn, {
                projectId: first.id,
                sequenceId: sequence.id,
                text: 'Learn aerodynamics',
            });
            const loose = await todosRepo.create(conn, {
                projectId: second.id,
                text: 'Buy a soldering iron',
            });

            // Act
            const rows = await todosRepo.listByOwner(conn, ownerId);

            // Assert
            expect(idsOf(rows).sort()).toEqual([filed.id, loose.id].sort());
        });

        test("never returns another user's to-dos", async () => {
            // Arrange
            const conn = getConn();
            const strangerId = await createTestUser(conn);
            const { project } = await createFixture(conn);
            await todosRepo.create(conn, { projectId: project.id, text: 'Learn aerodynamics' });

            // Act & Assert
            expect(await todosRepo.listByOwner(conn, strangerId)).toEqual([]);
        });
    });

});
