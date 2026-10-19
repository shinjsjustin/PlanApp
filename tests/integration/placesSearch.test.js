'use strict';

const request = require('supertest');

const app = require('../../src/server');
const placesRepo = require('../../src/db/repositories/placesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const mk = (conn, ownerId, name, extra = {}) =>
    placesRepo.create(conn, { ownerId, name, address: `${name} St`, ...extra });
const as = (userId) => ({ Authorization: authHeaderFor(userId) });

describe('GET /api/places?q=', () => {
    test('keeps places whose name contains q, case-insensitively, but startPlaceId uses all places', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const home = await mk(conn, ownerId, 'Home', { kind: 'home' });
        const cafe = await mk(conn, ownerId, 'Blue Cafe');
        await mk(conn, ownerId, 'Office');

        const response = await request(app).get('/api/places').query({ q: 'CAFE' }).set(as(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data.places.map((place) => place.id)).toEqual([cafe.id]);
        expect(response.body.data.startPlaceId).toBe(home.id);
    });

    test('blank q returns every place', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'A');
        await mk(conn, ownerId, 'B');

        const response = await request(app).get('/api/places').query({ q: ' ' }).set(as(ownerId));

        expect(response.body.data.places).toHaveLength(2);
    });

    test('q longer than 255 characters is 400', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app).get('/api/places').query({ q: 'x'.repeat(256) }).set(as(ownerId));

        expect(response.status).toBe(400);
    });
});

describe('place kind person', () => {
    test('POST answers 400', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app)
            .post('/api/places')
            .set(as(ownerId))
            .send({ name: 'P', address: 'x', kind: 'person' });

        expect(response.status).toBe(400);
    });

    test('PATCH answers 400', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mk(conn, ownerId, 'P');

        const response = await request(app).patch(`/api/places/${place.id}`).set(as(ownerId)).send({ kind: 'person' });

        expect(response.status).toBe(400);
    });
});
