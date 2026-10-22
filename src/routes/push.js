'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const repo = require('../db/repositories/pushSubscriptionsRepo');
const { isPushConfigured, publicKey, sendToOwner } = require('../lib/push/sendPush');
const { HttpError, conflict } = require('../lib/httpError');
const { withConnection } = require('../db/unitOfWork');

/**
 * Push registration for the app and the checks Bourne runs. Mounted at
 * `/api/push` behind `isAuth`.
 */

const router = express.Router();

// Column widths in push_subscriptions.
const MAX_ENDPOINT = 500;
const MAX_KEY = 255;

const TEST_PAYLOAD = { title: 'ShinPlan', body: 'Push is working', url: '/reminders' };

const endpointField = z
    .string({ error: 'endpoint is required' })
    .max(MAX_ENDPOINT, `endpoint must be at most ${MAX_ENDPOINT} characters`)
    .refine((value) => URL.canParse(value) && new URL(value).protocol === 'https:', 'endpoint must be an https URL');

const keyField = (name) =>
    z.string({ error: `${name} is required` }).min(1, `${name} is required`).max(MAX_KEY, `${name} must be at most ${MAX_KEY} characters`);

const subscriptionSchema = z.object({
    endpoint: endpointField,
    keys: z.object({ p256dh: keyField('p256dh'), auth: keyField('auth') }, { error: 'keys are required' }),
});

const unsubscribeSchema = z.object({ endpoint: endpointField });

// The column is UTC wall time, which the driver reads as a local-time Date.
const toUtcInstant = (date) =>
    new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()));

// GET /api/push/public-key
router.get('/public-key', (req, res) => {
    if (!isPushConfigured()) throw new HttpError(503, 'Push is not configured');

    res.sendData({ publicKey: publicKey() });
});

// POST /api/push/subscriptions
router.post(
    '/subscriptions',
    asyncRoute(async (req, res) => {
        const { endpoint, keys } = subscriptionSchema.parse(req.body ?? {});

        await withConnection((conn) => repo.save(conn, { ownerId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }));

        res.sendData({ endpoint }, 201);
    })
);

// DELETE /api/push/subscriptions
router.delete(
    '/subscriptions',
    asyncRoute(async (req, res) => {
        const { endpoint } = unsubscribeSchema.parse(req.body ?? {});

        await withConnection((conn) => repo.removeForOwner(conn, req.user.id, endpoint));

        res.sendData({ endpoint });
    })
);

// GET /api/push/status
router.get(
    '/status',
    asyncRoute(async (req, res) => {
        const rows = await withConnection((conn) => repo.listByOwner(conn, req.user.id));

        const configured = isPushConfigured();
        const successes = rows.filter((row) => row.last_success_at).map((row) => toUtcInstant(row.last_success_at));
        const latest = successes.length > 0 ? new Date(Math.max(...successes)) : null;

        res.sendData({
            configured,
            on: configured && rows.length > 0,
            devices: rows.length,
            lastSuccessAt: latest && latest.toISOString(),
        });
    })
);

// POST /api/push/test
router.post(
    '/test',
    asyncRoute(async (req, res) => {
        const result = await withConnection(async (conn) => {
            if (!isPushConfigured()) throw new HttpError(503, 'Push is not configured');
            if ((await repo.countByOwner(conn, req.user.id)) === 0) throw conflict('No devices are registered for push');

            return sendToOwner(conn, req.user.id, TEST_PAYLOAD);
        });

        res.sendData(result);
    })
);

module.exports = router;
