'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { TODO_PIN_BATCH_MAX_SIZE } = require('../../src/lib/validation');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction, createTestUser } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const requestPins = (ownerId, projectId, body) =>
    request(app)
        .put(`/api/projects/${projectId}/pins`)
        .set('Authorization', authHeaderFor(ownerId))
        .send(body);

const createTodo = (conn, projectId, sequenceId = null) =>
    todosRepo.create(conn, { projectId, sequenceId, text: 'A step' });

const createSequence = (conn, layerId) =>
    sequencesRepo.create(conn, { layerId, title: 'Another sequence' });

const todoPinned = async (conn, id) => Boolean((await todosRepo.findByIds(conn, [id]))[0].is_pinned);
const sequencePinned = async (conn, id) => Boolean((await sequencesRepo.findById(conn, id)).is_pinned);

const SEQUENCE_KEYS = [
    'createdAt',
    'description',
    'id',
    'isBlocked',
    'isCollapsed',
    'isPinned',
    'layerId',
    'position',
    'projectId',
    'title',
    'updatedAt',
];

describe('PUT /api/projects/:id/pins', () => {
    test('pins a to-do and a sequence together and returns both in full shapes', async () => {
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const todo = await createTodo(conn, project.id);

        const response = await requestPins(ownerId, project.id, {
            todoIds: [todo.id],
            sequenceIds: [sequence.id],
            isPinned: true,
        });

        expect(response.status).toBe(200);
        expect(response.body.data.todos).toHaveLength(1);
        expect(response.body.data.todos[0]).toMatchObject({ id: todo.id, isPinned: true });
        expect(response.body.data.sequences).toHaveLength(1);
        expect(response.body.data.sequences[0]).toMatchObject({ id: sequence.id, isPinned: true });
        expect(Object.keys(response.body.data.sequences[0]).sort()).toEqual(SEQUENCE_KEYS);
        expect(await todoPinned(conn, todo.id)).toBe(true);
        expect(await sequencePinned(conn, sequence.id)).toBe(true);
    });

    test('unpins a mixed batch', async () => {
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const todo = await createTodo(conn, project.id);
        await todosRepo.setPinned(conn, [todo.id], true);
        await sequencesRepo.setPinned(conn, [sequence.id], true);

        const response = await requestPins(ownerId, project.id, {
            todoIds: [todo.id],
            sequenceIds: [sequence.id],
            isPinned: false,
        });

        expect(response.status).toBe(200);
        expect(response.body.data.todos[0].isPinned).toBe(false);
        expect(response.body.data.sequences[0].isPinned).toBe(false);
        expect(await todoPinned(conn, todo.id)).toBe(false);
        expect(await sequencePinned(conn, sequence.id)).toBe(false);
    });

    test('accepts a sequence-only batch and returns no to-dos', async () => {
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);

        const response = await requestPins(ownerId, project.id, {
            sequenceIds: [sequence.id],
            isPinned: true,
        });

        expect(response.status).toBe(200);
        expect(response.body.data.todos).toEqual([]);
        expect(response.body.data.sequences.map((row) => row.id)).toEqual([sequence.id]);
    });

    test('accepts a to-do-only batch and returns no sequences', async () => {
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await createTodo(conn, project.id);

        const response = await requestPins(ownerId, project.id, {
            todoIds: [todo.id, todo.id],
            isPinned: true,
        });

        expect(response.status).toBe(200);
        expect(response.body.data.sequences).toEqual([]);
        expect(response.body.data.todos.map((row) => row.id)).toEqual([todo.id]);
    });

    test.each([true, false])(
        'leaves a sequence\'s to-dos unchanged when it is pinned=%s',
        async (isPinned) => {
            const conn = getConn();
            const { ownerId, project, sequence } = await createFixture(conn);
            const pinnedTodo = await createTodo(conn, project.id, sequence.id);
            const plainTodo = await createTodo(conn, project.id, sequence.id);
            await todosRepo.setPinned(conn, [pinnedTodo.id], true);
            await sequencesRepo.setPinned(conn, [sequence.id], !isPinned);

            const response = await requestPins(ownerId, project.id, {
                sequenceIds: [sequence.id],
                isPinned,
            });

            expect(response.status).toBe(200);
            expect(await todoPinned(conn, pinnedTodo.id)).toBe(true);
            expect(await todoPinned(conn, plainTodo.id)).toBe(false);
        }
    );

    test('deletes a booked sequence\'s booking when it is unpinned', async () => {
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });
        await sequencesRepo.setPinned(conn, [sequence.id], true);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            sequenceId: sequence.id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        const response = await requestPins(ownerId, project.id, {
            sequenceIds: [sequence.id],
            isPinned: false,
        });

        expect(response.status).toBe(200);
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
    });

    test('keeps a booking when pinning', async () => {
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            sequenceId: sequence.id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        await requestPins(ownerId, project.id, { sequenceIds: [sequence.id], isPinned: true });

        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toHaveLength(1);
    });

    describe('400 cases write nothing', () => {
        const setup = async (conn) => {
            const fixture = await createFixture(conn);
            const todo = await createTodo(conn, fixture.project.id);
            return { ...fixture, todo };
        };

        test('empty batch', async () => {
            const conn = getConn();
            const { ownerId, project } = await setup(conn);

            const response = await requestPins(ownerId, project.id, {
                todoIds: [],
                sequenceIds: [],
                isPinned: true,
            });

            expect(response.status).toBe(400);
        });

        test('missing lists', async () => {
            const conn = getConn();
            const { ownerId, project } = await setup(conn);

            const response = await requestPins(ownerId, project.id, { isPinned: true });

            expect(response.status).toBe(400);
        });

        test('non-boolean isPinned', async () => {
            const conn = getConn();
            const { ownerId, project, todo } = await setup(conn);

            const response = await requestPins(ownerId, project.id, {
                todoIds: [todo.id],
                isPinned: 'true',
            });

            expect(response.status).toBe(400);
            expect(await todoPinned(conn, todo.id)).toBe(false);
        });

        test('sequence in another project, with a valid to-do in the batch', async () => {
            const conn = getConn();
            const { ownerId, project, todo } = await setup(conn);
            const otherProject = await projectsRepo.create(conn, { ownerId, title: 'Other' });
            const otherLayer = await layersRepo.create(conn, {
                projectId: otherProject.id,
                title: 'Layer',
            });
            const otherSequence = await createSequence(conn, otherLayer.id);

            const response = await requestPins(ownerId, project.id, {
                todoIds: [todo.id],
                sequenceIds: [otherSequence.id],
                isPinned: true,
            });

            expect(response.status).toBe(400);
            expect(await todoPinned(conn, todo.id)).toBe(false);
            expect(await sequencePinned(conn, otherSequence.id)).toBe(false);
        });

        test('to-do in another project, with a valid sequence in the batch', async () => {
            const conn = getConn();
            const { ownerId, project, sequence } = await setup(conn);
            const otherProject = await projectsRepo.create(conn, { ownerId, title: 'Other' });
            const otherTodo = await createTodo(conn, otherProject.id);

            const response = await requestPins(ownerId, project.id, {
                todoIds: [otherTodo.id],
                sequenceIds: [sequence.id],
                isPinned: true,
            });

            expect(response.status).toBe(400);
            expect(await todoPinned(conn, otherTodo.id)).toBe(false);
            expect(await sequencePinned(conn, sequence.id)).toBe(false);
        });

        test('nonexistent sequence id', async () => {
            const conn = getConn();
            const { ownerId, project, todo } = await setup(conn);

            const response = await requestPins(ownerId, project.id, {
                todoIds: [todo.id],
                sequenceIds: [2147483647],
                isPinned: true,
            });

            expect(response.status).toBe(400);
            expect(await todoPinned(conn, todo.id)).toBe(false);
        });

        test.each(['todoIds', 'sequenceIds'])('%s over the batch maximum', async (field) => {
            const conn = getConn();
            const { ownerId, project, sequence } = await setup(conn);
            const ids = Array.from({ length: TODO_PIN_BATCH_MAX_SIZE + 1 }, (_, index) => index + 1);

            const response = await requestPins(ownerId, project.id, {
                sequenceIds: [sequence.id],
                [field]: ids,
                isPinned: true,
            });

            expect(response.status).toBe(400);
            expect(await sequencePinned(conn, sequence.id)).toBe(false);
        });

        test('unpin with a bad id keeps the existing booking', async () => {
            const conn = getConn();
            const { ownerId, project, sequence } = await setup(conn);
            const day = await calendarDaysRepo.create(conn, { ownerId });
            await sequencesRepo.setPinned(conn, [sequence.id], true);
            await calendarItemsRepo.upsert(conn, {
                dayId: day.id,
                sequenceId: sequence.id,
                startMinutes: 540,
                durationMinutes: 60,
            });

            const response = await requestPins(ownerId, project.id, {
                todoIds: [2147483647],
                sequenceIds: [sequence.id],
                isPinned: false,
            });

            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(await sequencePinned(conn, sequence.id)).toBe(true);
            expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toHaveLength(1);
        });
    });

    test('refuses another user\'s project before reading the body', async () => {
        const conn = getConn();
        const callerId = await createTestUser(conn);
        const other = await createFixture(conn);

        const response = await requestPins(callerId, other.project.id, {
            todoIds: [],
            isPinned: 'nope',
        });

        expect(response.status).toBe(403);
        expect(await sequencePinned(conn, other.sequence.id)).toBe(false);
    });

    test('refuses another user\'s sequence in the batch', async () => {
        const conn = getConn();
        const mine = await createFixture(conn);
        const theirs = await createFixture(conn);

        const response = await requestPins(mine.ownerId, mine.project.id, {
            sequenceIds: [theirs.sequence.id],
            isPinned: true,
        });

        expect(response.status).toBe(400);
        expect(await sequencePinned(conn, theirs.sequence.id)).toBe(false);
    });
});
