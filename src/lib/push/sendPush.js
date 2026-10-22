'use strict';

const repo = require('../../db/repositories/pushSubscriptionsRepo');
const webPush = require('./webPush');
const { fitPayload } = require('./payload');
const { HttpError } = require('../httpError');

const GONE_STATUSES = [404, 410];

// Read per call so the keys can change without a restart and tests can set them.
const vapidFromEnv = () => ({
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
});

const isPushConfigured = () => Object.values(vapidFromEnv()).every(Boolean);

const publicKey = () => process.env.VAPID_PUBLIC_KEY;

const sendToOwner = async (conn, ownerId, payload) => {
    if (!isPushConfigured()) throw new HttpError(503, 'Push is not configured');

    const vapid = vapidFromEnv();
    const body = fitPayload(payload);
    const result = { sent: 0, failed: 0, removed: 0 };

    for (const row of await repo.listByOwner(conn, ownerId)) {
        const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
        try {
            await webPush.sendNotification(subscription, body, { vapid });
            await repo.markSuccess(conn, row.id);
            result.sent += 1;
        } catch (err) {
            if (GONE_STATUSES.includes(err.statusCode)) {
                await repo.remove(conn, row.id);
                result.removed += 1;
            } else {
                console.error(`Push to subscription ${row.id} failed`, err);
                result.failed += 1;
            }
        }
    }

    return result;
};

module.exports = { isPushConfigured, publicKey, sendToOwner };
