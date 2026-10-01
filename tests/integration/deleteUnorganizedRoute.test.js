'use strict';

const request = require('supertest');

const app = require('../../src/server');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const requestClear = (userId, projectId) =>
    request(app)
        .delete(`/api/projects/${projectId}/todos/unorganized`)
        .set('Authorization', authHeaderFor(userId));

const loose = (conn, projectId, text) => todosRepo.create(conn, { projectId, text });

describe('DELETE /api/projects/:id/todos/unorganized', () => {
    test('removes only loose to-dos of the project and returns their ids', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const first = await loose(conn, project.id, 'One');
        const second = await loose(conn, project.id, 'Two');
        const filed = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Filed',
        });
        const other = await projectsRepo.create(conn, { ownerId, title: 'Other' });
        const otherLoose = await loose(conn, other.id, 'Elsewhere');

        // Act
        const response = await requestClear(ownerId, project.id);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ ids: [first.id, second.id] });
        const remaining = await todosRepo.findByIds(conn, [
            first.id,
            second.id,
            filed.id,
            otherLoose.id,
        ]);
        expect(remaining.map((row) => row.id).sort()).toEqual([filed.id, otherLoose.id].sort());
    });

    test('removes calendar bookings and pins of the deleted to-dos', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);
        const todo = await loose(conn, project.id, 'Booked');
        const day = await calendarDaysRepo.create(conn, { ownerId });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todo.id,
            startMinutes: 60,
            durationMinutes: 30,
        });
        await todosRepo.setPinned(conn, [todo.id], true);

        // Act
        const response = await requestClear(ownerId, project.id);

        // Assert
        expect(response.status).toBe(200);
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await todosRepo.listPinnedByProject(conn, project.id)).toEqual([]);
    });

    test('answers 200 with no ids when the panel is empty', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);

        // Act
        const response = await requestClear(ownerId, project.id);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ ids: [] });
    });

    test('refuses another user\'s project and leaves its to-dos', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createFixture(conn);
        const theirs = await createFixture(conn);
        const todo = await loose(conn, theirs.project.id, 'Theirs');

        // Act
        const response = await requestClear(mine.ownerId, theirs.project.id);

        // Assert
        expect(response.status).toBe(403);
        expect(await todosRepo.findByIds(conn, [todo.id])).toHaveLength(1);
    });
});
