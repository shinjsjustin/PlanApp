'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * An owner with one project, one sequence, `count` to-dos filed in it, and one
 * empty day — the smallest world in which a booking means anything.
 */
const createWorld = async (conn, count = 2) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Auth rewrite' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Groundwork' });
    // `sequencesRepo.create` takes the layer, not the project — it reads the
    // project off the layer itself.
    const sequence = await sequencesRepo.create(conn, {
        layerId: layer.id,
        title: 'Session handling',
    });

    const todos = [];
    for (let index = 0; index < count; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        todos.push(
            await todosRepo.create(conn, {
                projectId: project.id,
                text: `Step ${index}`,
                sequenceId: sequence.id,
            })
        );
    }

    const day = await calendarDaysRepo.create(conn, { ownerId });

    return { ownerId, project, sequence, todos, day };
};

describe('calendarItemsRepo.upsert', () => {
    test('books a to-do into a day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);

        // Act
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Assert
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            day_id: day.id,
            todo_id: todos[0].id,
            start_minutes: 540,
            duration_minutes: 60,
        });
    });

    test('moves an existing booking rather than creating a second one', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        const second = await calendarDaysRepo.create(conn, { ownerId });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        await calendarItemsRepo.upsert(conn, {
            dayId: second.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Assert — the unique key on todo_id is what makes this a move
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            day_id: second.id,
            start_minutes: 0,
            duration_minutes: 30,
        });
    });
});

describe('calendarItemsRepo.listByOwner', () => {
    test('carries the to-do, project and sequence a card has to draw', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const [item] = await calendarItemsRepo.listByOwner(conn, ownerId);

        // Assert
        expect(item).toMatchObject({
            text: 'Step 0',
            status: 'incomplete',
            project_id: project.id,
            project_title: 'Auth rewrite',
            sequence_id: sequence.id,
            sequence_title: 'Session handling',
        });
    });

    test('keeps a completed to-do’s booking, with its text intact', async () => {
        // Arrange — the failure this guards is invisible until a user ticks
        // something: an item that read itself out of the frontier would go blank.
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        await todosRepo.update(conn, todos[0].id, { status: 'complete' });
        const [item] = await calendarItemsRepo.listByOwner(conn, ownerId);

        // Assert
        expect(item.status).toBe('complete');
        expect(item.text).toBe('Step 0');
        expect(item.sequence_title).toBe('Session handling');
    });

    test('keeps the booking of a to-do returned to the unorganized panel', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act — the LEFT JOIN must not drop the row
        await todosRepo.move(conn, todos[0].id, { sequenceId: null, position: 0 });
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);

        // Assert
        expect(items).toHaveLength(1);
        expect(items[0].sequence_id).toBeNull();
        expect(items[0].sequence_title).toBeNull();
    });

    test('never returns another owner’s bookings', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createWorld(conn);
        const theirs = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: theirs.day.id,
            todoId: theirs.todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const items = await calendarItemsRepo.listByOwner(conn, mine.ownerId);

        // Assert
        expect(items).toEqual([]);
    });
});

describe('calendarItemsRepo.listByDayIds', () => {
    test('returns only the bookings in the named days', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        const other = await calendarDaysRepo.create(conn, { ownerId });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });
        await calendarItemsRepo.upsert(conn, {
            dayId: other.id,
            todoId: todos[1].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const items = await calendarItemsRepo.listByDayIds(conn, [day.id]);

        // Assert
        expect(items.map((item) => item.todo_id)).toEqual([todos[0].id]);
    });

    test('carries the same display data listByOwner does', async () => {
        // Arrange — the bulk endpoint reads the layout back through this, so a
        // row it returns has to be able to draw itself too.
        const conn = getConn();
        const { project, sequence, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const [item] = await calendarItemsRepo.listByDayIds(conn, [day.id]);

        // Assert
        expect(item).toMatchObject({
            text: 'Step 0',
            project_id: project.id,
            project_title: 'Auth rewrite',
            sequence_id: sequence.id,
            sequence_title: 'Session handling',
        });
    });

    test('returns an empty array for an empty list', async () => {
        // Arrange
        const conn = getConn();

        // Act + Assert
        await expect(calendarItemsRepo.listByDayIds(conn, [])).resolves.toEqual([]);
    });
});

describe('calendarItemsRepo.removeByTodoIds', () => {
    test('unschedules the named to-dos and leaves the rest', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[1].id,
            startMinutes: 30,
            durationMinutes: 30,
        });

        // Act
        const removed = await calendarItemsRepo.removeByTodoIds(conn, [todos[0].id]);

        // Assert
        expect(removed).toBe(1);
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(items.map((item) => item.todo_id)).toEqual([todos[1].id]);
    });

    test('does nothing for an empty list', async () => {
        // Arrange
        const conn = getConn();

        // Act + Assert
        await expect(calendarItemsRepo.removeByTodoIds(conn, [])).resolves.toBe(0);
    });
});

describe('deleting a day', () => {
    test('releases its bookings without deleting the to-dos', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        await calendarDaysRepo.remove(conn, day.id);

        // Assert
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await todosRepo.findById(conn, todos[0].id)).not.toBeNull();
    });
});
