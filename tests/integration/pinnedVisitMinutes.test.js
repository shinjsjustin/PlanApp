'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { authHeaderFor } = require('../helpers/auth');
const { createTestUser, useTransaction } = require('../helpers/db');

const getConn = useTransaction();

const createPlace = (conn, ownerId, name, visitMinutes) =>
    placesRepo.create(conn, { ownerId, name, address: `${name} St`, visitMinutes });

const pinnedTodo = async (conn, { projectId, sequenceId = null, text, placeId }) => {
    const todo = await todosRepo.create(conn, { projectId, sequenceId, text });
    if (placeId) await todosRepo.update(conn, todo.id, { placeId });
    await todosRepo.setPinned(conn, [todo.id], true);

    return todo;
};

describe('pinned visitMinutes', () => {
    test('pinnedTodos carry the to-do place, else the sequence place, else null', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const own = await createPlace(conn, ownerId, 'Own', 45);
        const seqPlace = await createPlace(conn, ownerId, 'Seq', 90);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const layer = await layersRepo.create(conn, { projectId: project.id });
        const placed = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Placed' });
        await sequencesRepo.update(conn, placed.id, { placeId: seqPlace.id });
        const bare = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Bare' });
        const ownTodo = await pinnedTodo(conn, {
            projectId: project.id, sequenceId: placed.id, text: 'own', placeId: own.id,
        });
        const inherits = await pinnedTodo(conn, {
            projectId: project.id, sequenceId: placed.id, text: 'inherits',
        });
        const neither = await pinnedTodo(conn, {
            projectId: project.id, sequenceId: bare.id, text: 'neither',
        });

        // Act
        const response = await request(app)
            .get('/api/projects')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        const minutes = Object.fromEntries(
            response.body.data[0].pinnedTodos.map((t) => [t.id, t.visitMinutes])
        );
        expect(minutes).toEqual({ [ownTodo.id]: 45, [inherits.id]: 90, [neither.id]: null });
    });

    test('pinnedSequences carry the sequence place visit length, else null', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await createPlace(conn, ownerId, 'Gym', 60);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const layer = await layersRepo.create(conn, { projectId: project.id });
        const placed = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Placed' });
        await sequencesRepo.update(conn, placed.id, { placeId: place.id });
        const bare = await sequencesRepo.create(conn, { layerId: layer.id, title: 'Bare' });
        await sequencesRepo.setPinned(conn, [placed.id, bare.id], true);

        // Act
        const response = await request(app)
            .get('/api/projects?include=pinnedSequences')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        const minutes = Object.fromEntries(
            response.body.data[0].pinnedSequences.map((s) => [s.title, s.visitMinutes])
        );
        expect(minutes).toEqual({ Placed: 60, Bare: null });
    });
});
