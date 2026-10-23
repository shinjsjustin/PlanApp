'use strict';

jest.mock('../../src/lib/push/webPush');

const request = require('supertest');

const app = require('../../src/server');
const webPush = require('../../src/lib/push/webPush');
const subsRepo = require('../../src/db/repositories/pushSubscriptionsRepo');
const tokensRepo = require('../../src/db/repositories/deviceTokensRepo');
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

describe('forwarding to Bourne', () => {
    test.each([
        ['arrive', /^Ada arrived at Gym \d\d:\d\d$/],
        ['leave', /^Ada left Gym \d\d:\d\d$/],
    ])('posts one %s line with the token when no reminders match', async (event, pattern) => {
        const { token, place } = await setup();

        const response = await post(place.id, event, bearer(token));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(BOURNE.BOURNE_PLACE_URL);
        expect(init.headers.Authorization).toBe('Bearer bridge-secret');
        expect(JSON.parse(init.body)).toEqual({ text: expect.stringMatching(pattern) });
    });

    test('posts once when reminders match and still pushes them', async () => {
        const { conn, ownerId, token, place } = await setup();
        await remindersRepo.create(conn, { ownerId, title: 'Ping', placeId: place.id, timeZone: 'UTC', trigger: 'arrive' });

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.body.data).toEqual({ matched: 1, sent: 1, failed: 0, removed: 0 });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    });

    test('status and body match the same request with forwarding off', async () => {
        const { conn, ownerId, token, place } = await setup();
        await remindersRepo.create(conn, { ownerId, title: 'Ping', placeId: place.id, timeZone: 'UTC', trigger: 'arrive' });

        const on = await post(place.id, 'arrive', bearer(token));
        delete process.env.BOURNE_PLACE_URL;
        const off = await post(place.id, 'arrive', bearer(token));

        expect(on.status).toBe(off.status);
        expect(on.body).toEqual(off.body);
    });

    test('still forwards when push is not configured and answers 503', async () => {
        const { token, place } = await setup();
        delete process.env.VAPID_PRIVATE_KEY;

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(503);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test.each([['BOURNE_PLACE_URL'], ['BOURNE_PLACE_TOKEN']])('never calls fetch when %s is unset', async (name) => {
        const { token, place } = await setup();
        delete process.env[name];

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(200);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('never calls fetch for a 404 place', async () => {
        const { token } = await setup();

        const response = await post(999999999, 'arrive', bearer(token));

        expect(response.status).toBe(404);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("never calls fetch for another owner's place", async () => {
        const { conn, token } = await setup();
        const otherId = await createTestUser(conn);
        const theirs = await placesRepo.create(conn, { ownerId: otherId, name: 'Theirs', address: '2 Main' });

        const response = await post(theirs.id, 'arrive', bearer(token));

        expect(response.status).toBe(404);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('never calls fetch for a bad event (400)', async () => {
        const { token, place } = await setup();

        const response = await post(place.id, 'enter', bearer(token));

        expect(response.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('never calls fetch without a valid token (401)', async () => {
        const { place } = await setup();

        const response = await post(place.id, 'arrive', bearer('nope'));

        expect(response.status).toBe(401);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('a failing Bridge', () => {
    test.each([
        ['rejects', () => Promise.reject(new Error('down'))],
        ['answers 500', () => Promise.resolve({ ok: false, status: 500 })],
    ])('leaves status, body and push unchanged when it %s', async (_name, impl) => {
        const { conn, ownerId, token, place } = await setup();
        await remindersRepo.create(conn, { ownerId, title: 'Ping', placeId: place.id, timeZone: 'UTC', trigger: 'arrive' });
        fetchSpy.mockImplementation(impl);

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ matched: 1, sent: 1, failed: 0, removed: 0 });
        expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    });

    test('does not make the response wait when it never answers', async () => {
        const { token, place } = await setup();
        fetchSpy.mockImplementation(() => new Promise(() => {}));
        const started = Date.now();

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(200);
        expect(Date.now() - started).toBeLessThan(1000);
    });
});
