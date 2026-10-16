'use strict';

const request = require('supertest');

const app = require('../../src/server');
const placesRepo = require('../../src/db/repositories/placesRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const mkPlace = (conn, ownerId, name) =>
    placesRepo.create(conn, { ownerId, name, address: `${name} St` });

const setup = async (conn) => {
    const fixture = await createFixture(conn);
    const row = await sequencesRepo.create(conn, { layerId: fixture.layer.id, title: 'Second' });

    return { ...fixture, row };
};

const patch = (userId, id, body) =>
    request(app).patch(`/api/sequences/${id}`).set('Authorization', authHeaderFor(userId)).send(body);

describe('PATCH /api/sequences/:id placeId', () => {
    test('saves the place and returns it as placeId', async () => {
        const conn = getConn();
        const { ownerId, row } = await setup(conn);
        const place = await mkPlace(conn, ownerId, 'Gym');

        const response = await patch(ownerId, row.id, { placeId: place.id });

        expect(response.status).toBe(200);
        expect(response.body.data.placeId).toBe(place.id);
        expect((await sequencesRepo.findById(conn, row.id)).place_id).toBe(place.id);
    });

    test('null clears the place', async () => {
        const conn = getConn();
        const { ownerId, row } = await setup(conn);
        const place = await mkPlace(conn, ownerId, 'Gym');
        await patch(ownerId, row.id, { placeId: place.id });

        const response = await patch(ownerId, row.id, { placeId: null });

        expect(response.status).toBe(200);
        expect(response.body.data.placeId).toBeNull();
        expect((await sequencesRepo.findById(conn, row.id)).place_id).toBeNull();
    });

    test('placeId is null on a fresh row', async () => {
        const conn = getConn();
        const { ownerId, row } = await setup(conn);

        const response = await patch(ownerId, row.id, { title: 'Same' });

        expect(response.body.data.placeId).toBeNull();
    });

    test('answers 403 for another user’s place and leaves the row unchanged', async () => {
        const conn = getConn();
        const { ownerId, row } = await setup(conn);
        const strangerId = await createTestUser(conn);
        const theirs = await mkPlace(conn, strangerId, 'Theirs');

        const response = await patch(ownerId, row.id, { placeId: theirs.id });

        expect(response.status).toBe(403);
        expect((await sequencesRepo.findById(conn, row.id)).place_id).toBeNull();
    });

    test('answers 404 for an unknown place and leaves the row unchanged', async () => {
        const conn = getConn();
        const { ownerId, row } = await setup(conn);

        const response = await patch(ownerId, row.id, { placeId: 999999999 });

        expect(response.status).toBe(404);
        expect((await sequencesRepo.findById(conn, row.id)).place_id).toBeNull();
    });

    test('deleting the place leaves placeId null', async () => {
        const conn = getConn();
        const { ownerId, row } = await setup(conn);
        const place = await mkPlace(conn, ownerId, 'Gym');
        await patch(ownerId, row.id, { placeId: place.id });

        await placesRepo.remove(conn, place.id);

        expect((await sequencesRepo.findById(conn, row.id)).place_id).toBeNull();
    });
});
