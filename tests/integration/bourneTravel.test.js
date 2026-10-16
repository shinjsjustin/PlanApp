'use strict';

jest.mock('../../src/lib/google/routesApi');

const request = require('supertest');

const app = require('../../src/server');
const { computeDrive } = require('../../src/lib/google/routesApi');
const placesRepo = require('../../src/db/repositories/placesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const DEPART_AT = '2030-01-07T15:00:00.000Z';

const seed = async () => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const strangerId = await createTestUser(conn);
    const home = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Travel Test Way', kind: 'home' });
    const work = await placesRepo.create(conn, { ownerId, name: 'Work', address: '2 Travel Test Way' });
    const theirs = await placesRepo.create(conn, { ownerId: strangerId, name: 'Theirs', address: '3 Travel Test Way' });
    return { header: authHeaderFor(ownerId), home, work, theirs };
};

const travel = (header, query) =>
    request(app).get('/api/bourne/travel').query(query).set('Authorization', header);

describe('GET /api/bourne/travel', () => {
    const originalKey = process.env.GOOGLE_MAPS_API_KEY;

    beforeEach(() => {
        process.env.GOOGLE_MAPS_API_KEY = 'test-key';
        computeDrive.mockReset();
    });

    afterAll(() => {
        if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
        else process.env.GOOGLE_MAPS_API_KEY = originalKey;
    });

    test('answers the drive between two owned places', async () => {
        const { header, home, work } = await seed();
        computeDrive.mockResolvedValue({ durationSeconds: 600, distanceMeters: 4200 });

        const res = await travel(header, { from: home.id, to: work.id, departAt: DEPART_AT });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            from: home.id,
            to: work.id,
            departAt: DEPART_AT,
            status: 'ok',
            durationSeconds: 600,
            distanceMeters: 4200,
            mapsUrl: expect.stringContaining('origin=1%20Travel%20Test%20Way'),
        });
        expect(computeDrive).toHaveBeenCalledTimes(1);
        expect(computeDrive.mock.calls[0][1]).toMatchObject({
            originAddress: '1 Travel Test Way',
            destinationAddress: '2 Travel Test Way',
        });
    });

    test('answers 200 unavailable with a maps link when Google fails', async () => {
        const { header, home, work } = await seed();
        computeDrive.mockRejectedValue(new Error('boom'));

        const res = await travel(header, { from: work.id, to: home.id, departAt: DEPART_AT });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('unavailable');
        expect(res.body.data.mapsUrl).toContain('destination=1%20Travel%20Test%20Way');
    });

    test('answers ok with zero drive and no Google call for the same place', async () => {
        const { header, home } = await seed();

        const res = await travel(header, { from: home.id, to: home.id, departAt: DEPART_AT });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            from: home.id,
            to: home.id,
            departAt: DEPART_AT,
            status: 'ok',
            durationSeconds: 0,
            distanceMeters: 0,
        });
        expect(res.body.data.mapsUrl).toContain('https://www.google.com/maps/dir/');
        expect(computeDrive).not.toHaveBeenCalled();
    });

    test('answers 403 for another user’s place', async () => {
        const { header, home, theirs } = await seed();

        expect((await travel(header, { from: home.id, to: theirs.id, departAt: DEPART_AT })).status).toBe(403);
        expect((await travel(header, { from: theirs.id, to: home.id, departAt: DEPART_AT })).status).toBe(403);
        expect(computeDrive).not.toHaveBeenCalled();
    });

    test('answers 404 for an unknown place', async () => {
        const { header, home } = await seed();

        const res = await travel(header, { from: home.id, to: 999999999, departAt: DEPART_AT });

        expect(res.status).toBe(404);
    });

    test.each([
        ['non-numeric from', { from: 'x', to: 1, departAt: DEPART_AT }],
        ['zero to', { from: 1, to: 0, departAt: DEPART_AT }],
        ['fractional from', { from: 1.5, to: 1, departAt: DEPART_AT }],
        ['missing departAt', { from: 1, to: 2 }],
        ['non-ISO departAt', { from: 1, to: 2, departAt: 'tomorrow' }],
    ])('answers 400 for %s', async (_name, query) => {
        const { header } = await seed();

        expect((await travel(header, query)).status).toBe(400);
    });

    test('answers 401 without a token', async () => {
        const res = await request(app).get('/api/bourne/travel').query({ from: 1, to: 2, departAt: DEPART_AT });

        expect(res.status).toBe(401);
    });
});
