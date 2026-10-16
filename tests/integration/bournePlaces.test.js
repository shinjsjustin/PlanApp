'use strict';

const request = require('supertest');

const app = require('../../src/server');
const placesRepo = require('../../src/db/repositories/placesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

describe('GET /api/bourne/places', () => {
    test('answers the same payload as GET /api/places, caller’s places only', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Main', kind: 'home' });
        await placesRepo.create(conn, { ownerId: strangerId, name: 'Theirs', address: '2 Main', kind: 'home' });
        const header = authHeaderFor(ownerId);

        const bourne = await request(app).get('/api/bourne/places').set('Authorization', header);
        const app_ = await request(app).get('/api/places').set('Authorization', header);

        expect(bourne.status).toBe(200);
        expect(bourne.body.data.places.map((p) => p.name)).toEqual(['Home']);
        expect(bourne.body.data.startPlaceId).toBe(bourne.body.data.places[0].id);
        expect(bourne.body.data).toEqual(app_.body.data);
    });

    test('answers 401 without a token', async () => {
        expect((await request(app).get('/api/bourne/places')).status).toBe(401);
    });
});
