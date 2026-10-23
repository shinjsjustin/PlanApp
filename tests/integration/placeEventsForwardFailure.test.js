'use strict';

jest.mock('../../src/lib/push/webPush');

const request = require('supertest');

const app = require('../../src/server');
const webPush = require('../../src/lib/push/webPush');
const subsRepo = require('../../src/db/repositories/pushSubscriptionsRepo');
const tokensRepo = require('../../src/db/repositories/deviceTokensRepo');
const placeEventsRepo = require('../../src/db/repositories/placeEventsRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const remindersRepo = require('../../src/db/repositories/remindersRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const VAPID = { VAPID_SUBJECT: 'mailto:test@example.com', VAPID_PUBLIC_KEY: 'pub-key', VAPID_PRIVATE_KEY: 'priv-key' };
const BOURNE = { BOURNE_PLACE_URL: 'https://bridge.example.com/bourne/prompt', BOURNE_PLACE_TOKEN: 'bridge-secret', BOURNE_PLACE_TIME_ZONE: 'UTC' };
const savedEnv = { ...process.env };

let fetchSpy;
let errorSpy;

beforeEach(() => {
    Object.assign(process.env, VAPID, BOURNE);
    webPush.sendNotification.mockReset();
    webPush.sendNotification.mockResolvedValue({});
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
    fetchSpy.mockRestore();
    errorSpy.mockRestore();
});
afterAll(() => {
    process.env = savedEnv;
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const setup = async () => {
    const conn = getConn();
    const ownerId = await createTestUser(conn, { name: 'Ada Lovelace' });
    const { token } = await tokensRepo.create(conn, { ownerId, name: 'iPhone' });
    await subsRepo.save(conn, { ownerId, endpoint: 'https://push.example.com/a', p256dh: 'p', auth: 'a' });
    const place = await placesRepo.create(conn, { ownerId, name: 'Gym', address: '1 Main' });

    return { conn, ownerId, token, place };
};

const post = (placeId, event, headers) => request(app).post(`/api/place-events/${placeId}/${event}`).set(headers);


describe('a failing owner name read', () => {
    const withReminder = async () => {
        const s = await setup();
        await remindersRepo.create(s.conn, { ownerId: s.ownerId, title: 'Ping', placeId: s.place.id, timeZone: 'UTC', trigger: 'arrive' });
        jest.spyOn(placeEventsRepo, 'ownerName').mockRejectedValue(new Error('db down'));
        return s;
    };

    test.each([
        ['arrive', /^Justin arrived at Gym/],
        ['leave', /^Justin left Gym/],
    ])('%s matches the forwarding-off response, pushes, and forwards with the default name', async (event, pattern) => {
        const { conn, ownerId, token, place } = await withReminder();
        if (event === 'leave') {
            await remindersRepo.create(conn, { ownerId, title: 'Bye', placeId: place.id, timeZone: 'UTC', trigger: 'leave' });
        }

        const on = await post(place.id, event, bearer(token));
        const [, init] = fetchSpy.mock.calls[0];
        const pushesOn = webPush.sendNotification.mock.calls.length;
        delete process.env.BOURNE_PLACE_URL;
        const off = await post(place.id, event, bearer(token));

        expect(on.status).toBe(200);
        expect(on.status).toBe(off.status);
        expect(on.body).toEqual(off.body);
        expect(pushesOn).toBe(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(init.body).text).toMatch(pattern);
    });

    test('logs one console.error with only the error name', async () => {
        const { token, place } = await withReminder();

        await post(place.id, 'arrive', bearer(token));

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const logged = JSON.stringify(errorSpy.mock.calls[0].map(String));
        expect(logged).toContain('Error');
        expect(logged).not.toMatch(/db down|Gym|arrived|\d\d:\d\d/);
    });

    test('never reads the owner name when forwarding is unset', async () => {
        const { token, place } = await withReminder();
        delete process.env.BOURNE_PLACE_URL;

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(200);
        expect(placeEventsRepo.ownerName).not.toHaveBeenCalled();
    });
});
