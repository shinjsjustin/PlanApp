'use strict';

jest.mock('../../src/lib/push/webPush');

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/pushSubscriptionsRepo');
const webPush = require('../../src/lib/push/webPush');
const { isPushConfigured, publicKey, sendToOwner } = require('../../src/lib/push/sendPush');

const getConn = useTransaction();

const VAPID = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@example.com' };
const payload = { title: 'Call', body: 'Now', url: '/reminders' };
const failure = (statusCode) => Object.assign(new Error('push failed'), { statusCode });

const saveSub = (conn, ownerId, n) =>
    repo.save(conn, { ownerId, endpoint: `https://push.example/${n}`, p256dh: `k${n}`, auth: `a${n}` });

describe('sendPush', () => {
    const saved = { ...process.env };

    beforeEach(() => {
        Object.assign(process.env, VAPID);
        webPush.sendNotification.mockReset();
    });
    afterEach(() => {
        process.env = { ...saved };
        jest.restoreAllMocks();
    });

    it('sends the payload to every subscription with the vapid details and records success', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        await saveSub(conn, owner, 1);
        await saveSub(conn, owner, 2);
        webPush.sendNotification.mockResolvedValue({ statusCode: 201 });

        const result = await sendToOwner(conn, owner, payload);

        expect(result).toEqual({ sent: 2, failed: 0, removed: 0 });
        expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
        expect(webPush.sendNotification).toHaveBeenCalledWith(
            { endpoint: 'https://push.example/1', keys: { p256dh: 'k1', auth: 'a1' } },
            payload,
            { vapid: { subject: 'mailto:a@example.com', publicKey: 'pub', privateKey: 'priv' } }
        );
        const rows = await repo.listByOwner(conn, owner);
        expect(rows.every((r) => r.last_success_at !== null)).toBe(true);
    });

    it.each([404, 410])('deletes a subscription answered with %i', async (statusCode) => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        await saveSub(conn, owner, 1);
        webPush.sendNotification.mockRejectedValue(failure(statusCode));

        const result = await sendToOwner(conn, owner, payload);

        expect(result).toEqual({ sent: 0, failed: 0, removed: 1 });
        expect(await repo.countByOwner(conn, owner)).toBe(0);
    });

    it('logs and keeps a subscription on any other error, still sending to the rest', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        await saveSub(conn, owner, 1);
        await saveSub(conn, owner, 2);
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
        webPush.sendNotification.mockRejectedValueOnce(failure(500)).mockResolvedValueOnce({ statusCode: 201 });

        const result = await sendToOwner(conn, owner, payload);

        expect(result).toEqual({ sent: 1, failed: 1, removed: 0 });
        expect(errorLog).toHaveBeenCalledTimes(1);
        expect(await repo.countByOwner(conn, owner)).toBe(2);
        const rows = await repo.listByOwner(conn, owner);
        expect(rows.filter((r) => r.last_success_at !== null)).toHaveLength(1);
    });

    it('returns zeros when the owner has no subscriptions', async () => {
        const conn = getConn();
        const owner = await createTestUser(conn);

        expect(await sendToOwner(conn, owner, payload)).toEqual({ sent: 0, failed: 0, removed: 0 });
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it('exposes the public key and reports configured when all three variables are set', () => {
        expect(isPushConfigured()).toBe(true);
        expect(publicKey()).toBe('pub');
    });

    it.each(Object.keys(VAPID))('is not configured and sendToOwner throws 503 when %s is unset', async (name) => {
        const conn = getConn();
        const owner = await createTestUser(conn);
        await saveSub(conn, owner, 1);
        delete process.env[name];

        expect(isPushConfigured()).toBe(false);
        await expect(sendToOwner(conn, owner, payload)).rejects.toMatchObject({
            name: 'HttpError', status: 503, message: 'Push is not configured',
        });
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });
});
