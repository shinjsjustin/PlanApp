'use strict';

jest.mock('../../src/lib/google/routesApi');

const request = require('supertest');

const app = require('../../src/server');
const { computeDrive } = require('../../src/lib/google/routesApi');
const placesRepo = require('../../src/db/repositories/placesRepo');
const travelTimesRepo = require('../../src/db/repositories/travelTimesRepo');
const { travelBetween } = require('../../src/lib/travelTime');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const DEPART_AT = '2030-01-07T15:00:00.000Z';

const seedOwner = async () => {
    const ownerId = await createTestUser(getConn());
    return { ownerId, header: authHeaderFor(ownerId) };
};

describe('places without an address', () => {
    test.each([
        ['omitted', { name: 'Home' }],
        ['null', { name: 'Home', address: null }],
    ])('POST answers 201 with null address when address is %s', async (_n, body) => {
        const { header } = await seedOwner();

        const res = await request(app).post('/api/places').set('Authorization', header).send(body);

        expect(res.status).toBe(201);
        expect(res.body.data.address).toBeNull();
    });

    test('PATCH can set address to null', async () => {
        const { ownerId, header } = await seedOwner();
        const place = await placesRepo.create(getConn(), { ownerId, name: 'Home', address: '1 Main St' });

        const res = await request(app)
            .patch(`/api/places/${place.id}`)
            .set('Authorization', header)
            .send({ address: null });

        expect(res.status).toBe(200);
        expect(res.body.data.address).toBeNull();
    });

    test.each(['', '   '])('POST and PATCH answer 400 for blank address %j', async (address) => {
        const { ownerId, header } = await seedOwner();
        const place = await placesRepo.create(getConn(), { ownerId, name: 'Home', address: '1 Main St' });

        const post = await request(app).post('/api/places').set('Authorization', header).send({ name: 'X', address });
        const patch = await request(app)
            .patch(`/api/places/${place.id}`)
            .set('Authorization', header)
            .send({ address });

        expect(post.status).toBe(400);
        expect(patch.status).toBe(400);
    });

    test('placesRepo.create defaults address to null', async () => {
        const { ownerId } = await seedOwner();

        const place = await placesRepo.create(getConn(), { ownerId, name: 'Home' });

        expect(place.address).toBeNull();
    });
});

describe('travel with a missing address', () => {
    const originalKey = process.env.GOOGLE_MAPS_API_KEY;

    beforeEach(() => {
        process.env.GOOGLE_MAPS_API_KEY = 'test-key';
        computeDrive.mockReset();
    });

    afterAll(() => {
        if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
        else process.env.GOOGLE_MAPS_API_KEY = originalKey;
    });

    test.each([
        ['origin', null, '2 Way'],
        ['destination', '1 Way', null],
        ['both', null, null],
    ])('travelBetween is unavailable without cache or Google when %s is null', async (_n, originAddress, destinationAddress) => {
        const findFresh = jest.spyOn(travelTimesRepo, 'findFresh');

        const result = await travelBetween({
            originAddress,
            destinationAddress,
            departAt: new Date(DEPART_AT),
            timeZone: 'UTC',
            now: new Date('2030-01-01T00:00:00Z'),
        });

        expect(result).toEqual({ status: 'unavailable', mapsUrl: null });
        expect(findFresh).not.toHaveBeenCalled();
        expect(computeDrive).not.toHaveBeenCalled();
        findFresh.mockRestore();
    });

    test('GET /api/bourne/travel answers 200 unavailable between a place with and one without an address', async () => {
        const { ownerId, header } = await seedOwner();
        const home = await placesRepo.create(getConn(), { ownerId, name: 'Home', address: '1 Way' });
        const church = await placesRepo.create(getConn(), { ownerId, name: 'Church' });

        const res = await request(app)
            .get('/api/bourne/travel')
            .query({ from: home.id, to: church.id, departAt: DEPART_AT })
            .set('Authorization', header);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ status: 'unavailable', mapsUrl: null });
        expect(computeDrive).not.toHaveBeenCalled();
    });

    test('same place with no address answers 200 without a maps url', async () => {
        const { ownerId, header } = await seedOwner();
        const church = await placesRepo.create(getConn(), { ownerId, name: 'Church' });

        const res = await request(app)
            .get('/api/bourne/travel')
            .query({ from: church.id, to: church.id, departAt: DEPART_AT })
            .set('Authorization', header);

        expect(res.status).toBe(200);
        expect(res.body.data.mapsUrl).toBeNull();
    });
});
