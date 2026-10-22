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
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const VAPID = { VAPID_SUBJECT: 'mailto:test@example.com', VAPID_PUBLIC_KEY: 'pub-key', VAPID_PRIVATE_KEY: 'priv-key' };
const savedEnv = { ...process.env };

beforeEach(() => {
    Object.assign(process.env, VAPID);
    webPush.sendNotification.mockReset();
    webPush.sendNotification.mockResolvedValue({});
});
afterAll(() => {
    process.env = savedEnv;
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const setup = async () => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const { token, id: tokenId } = await tokensRepo.create(conn, { ownerId, name: 'iPhone' });
    await subsRepo.save(conn, { ownerId, endpoint: 'https://push.example.com/a', p256dh: 'p', auth: 'a' });
    const place = await placesRepo.create(conn, { ownerId, name: 'Gym', address: '1 Main' });

    return { conn, ownerId, token, tokenId, place };
};

const remind = (conn, ownerId, placeId, title, extra = {}) =>
    remindersRepo.create(conn, { ownerId, title, placeId, timeZone: 'UTC', trigger: 'arrive', ...extra });

const post = (placeId, event, headers) => request(app).post(`/api/place-events/${placeId}/${event}`).set(headers);

describe('device token guard', () => {
    test('answers 401 without a token and sends nothing', async () => {
        const { place } = await setup();

        const response = await request(app).post(`/api/place-events/${place.id}/arrive`);

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
    });

    test('answers 401 for an unknown token', async () => {
        const { place } = await setup();

        const response = await post(place.id, 'arrive', bearer('nope'));

        expect(response.status).toBe(401);
    });

    test('answers 401 for a revoked token', async () => {
        const { conn, ownerId, token, tokenId, place } = await setup();
        await tokensRepo.removeForOwner(conn, ownerId, tokenId);

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(401);
    });

    test('does not accept a user JWT', async () => {
        const { ownerId, place } = await setup();

        const response = await post(place.id, 'arrive', { Authorization: authHeaderFor(ownerId) });

        expect(response.status).toBe(401);
    });

    test('a valid token sets last_used_at', async () => {
        const { conn, ownerId, token, place } = await setup();

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(200);
        const [row] = await tokensRepo.listByOwner(conn, ownerId);
        expect(row.last_used_at).not.toBeNull();
    });
});

describe('validation', () => {
    test.each([['enter'], ['Arrive'], ['none']])('answers 400 for event %s', async (event) => {
        const { token, place } = await setup();

        const response = await post(place.id, event, bearer(token));

        expect(response.status).toBe(400);
    });

    test('answers 400 for a non-numeric place id', async () => {
        const { token } = await setup();

        const response = await post('abc', 'arrive', bearer(token));

        expect(response.status).toBe(400);
    });

    test('answers 404 for a missing place', async () => {
        const { token } = await setup();

        const response = await post(999999999, 'arrive', bearer(token));

        expect(response.status).toBe(404);
    });

    test("answers 404 for another owner's place and sends nothing", async () => {
        const { conn, token } = await setup();
        const otherId = await createTestUser(conn);
        const theirs = await placesRepo.create(conn, { ownerId: otherId, name: 'Theirs', address: '2 Main' });
        await remind(conn, otherId, theirs.id, 'Secret');

        const response = await post(theirs.id, 'arrive', bearer(token));

        expect(response.status).toBe(404);
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });
});

describe('POST /api/place-events/:placeId/:event', () => {
    test('pushes one arrive message listing matching titles by due date', async () => {
        const { conn, ownerId, token, place } = await setup();
        await remind(conn, ownerId, place.id, 'Later', { dueDate: '2026-12-02' });
        await remind(conn, ownerId, place.id, 'Sooner', { dueDate: '2026-12-01' });

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ matched: 2, sent: 1, failed: 0, removed: 0 });
        expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
        expect(webPush.sendNotification.mock.calls[0][1]).toEqual({
            title: 'ShinPlan',
            body: 'Arrived at Gym\nSooner\nLater',
            url: `/reminders?place=${place.id}`,
        });
    });

    test('uses the leaving wording for a leave event and skips arrive-only reminders', async () => {
        const { conn, ownerId, token, place } = await setup();
        await remind(conn, ownerId, place.id, 'Bring keys', { trigger: 'leave' });
        await remind(conn, ownerId, place.id, 'Say hi', { trigger: 'arrive' });

        const response = await post(place.id, 'leave', bearer(token));

        expect(response.body.data.matched).toBe(1);
        expect(webPush.sendNotification.mock.calls[0][1].body).toBe('Leaving Gym\nBring keys');
    });

    test('ignores done reminders, other places and reminders with no trigger', async () => {
        const { conn, ownerId, token, place } = await setup();
        const other = await placesRepo.create(conn, { ownerId, name: 'Shop', address: '3 Main' });
        const done = await remind(conn, ownerId, place.id, 'Finished');
        await remindersRepo.close(conn, done.id, 'done');
        await remind(conn, ownerId, other.id, 'Elsewhere');
        await remind(conn, ownerId, place.id, 'No trigger', { trigger: 'none' });

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.body.data).toEqual({ matched: 0, sent: 0, failed: 0, removed: 0 });
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    test('sends nothing for a snoozed reminder but includes one whose snooze has ended', async () => {
        const { conn, ownerId, token, place } = await setup();
        await remind(conn, ownerId, place.id, 'Snoozed', { dueDate: '2026-12-01' });
        await remind(conn, ownerId, place.id, 'Woke up', { dueDate: '2026-12-02' });
        await conn.execute("UPDATE reminders SET snoozed_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE title = 'Snoozed'");
        await conn.execute("UPDATE reminders SET snoozed_until = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE title = 'Woke up'");

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.body.data.matched).toBe(1);
        expect(webPush.sendNotification.mock.calls[0][1].body).toBe('Arrived at Gym\nWoke up');
    });

    test('reports removed endpoints', async () => {
        const { conn, ownerId, token, place } = await setup();
        await remind(conn, ownerId, place.id, 'Ping');
        webPush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.body.data).toEqual({ matched: 1, sent: 0, failed: 0, removed: 1 });
    });

    test('answers 503 when push is not configured', async () => {
        const { conn, ownerId, token, place } = await setup();
        await remind(conn, ownerId, place.id, 'Ping');
        delete process.env.VAPID_PRIVATE_KEY;

        const response = await post(place.id, 'arrive', bearer(token));

        expect(response.status).toBe(503);
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });
});
