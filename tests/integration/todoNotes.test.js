'use strict';

const request = require('supertest');

const app = require('../../src/server');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const setup = async () => {
    const conn = getConn();
    const { ownerId, project, sequence } = await createFixture(conn);
    const todo = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });

    return { conn, ownerId, project, sequence, todo };
};

const patchNote = (ownerId, todoId, body) =>
    request(app)
        .patch(`/api/todos/${todoId}`)
        .set('Authorization', authHeaderFor(ownerId))
        .send(body);

describe('todo notes', () => {
    test('PATCH saves a trimmed multi-line note and returns it', async () => {
        const { conn, ownerId, todo } = await setup();

        const response = await patchNote(ownerId, todo.id, { note: '  one\ntwo  ' });

        expect(response.status).toBe(200);
        expect(response.body.data.note).toBe('one\ntwo');
        expect((await todosRepo.findById(conn, todo.id)).note).toBe('one\ntwo');
    });

    test.each([[''], ['   '], [null]])('PATCH with note %j stores null', async (blank) => {
        const { conn, ownerId, todo } = await setup();
        await patchNote(ownerId, todo.id, { note: 'something' });

        const response = await patchNote(ownerId, todo.id, { note: blank });

        expect(response.status).toBe(200);
        expect(response.body.data.note).toBeNull();
        expect((await todosRepo.findById(conn, todo.id)).note).toBeNull();
    });

    test('PATCH without note leaves an existing note alone', async () => {
        const { ownerId, todo } = await setup();
        await patchNote(ownerId, todo.id, { note: 'keep me' });

        const response = await patchNote(ownerId, todo.id, { text: 'Renamed' });

        expect(response.body.data).toMatchObject({ text: 'Renamed', note: 'keep me' });
    });

    test('PATCH rejects a note over 5000 characters with 400', async () => {
        const { conn, ownerId, todo } = await setup();

        const response = await patchNote(ownerId, todo.id, { note: 'a'.repeat(5001) });

        expect(response.status).toBe(400);
        expect((await todosRepo.findById(conn, todo.id)).note).toBeNull();
    });

    test('the note survives a move and appears in the project graph', async () => {
        const { ownerId, project, sequence, todo } = await setup();
        await patchNote(ownerId, todo.id, { note: 'remember' });

        const moved = await request(app)
            .put(`/api/todos/${todo.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ sequenceId: sequence.id, position: 0 });
        const graph = await request(app)
            .get(`/api/projects/${project.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        expect(moved.body.data.note).toBe('remember');
        expect(graph.body.data.todos.map((t) => [t.id, t.note])).toEqual([[todo.id, 'remember']]);
    });
});
