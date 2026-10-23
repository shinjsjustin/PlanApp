'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const placesRepo = require('../db/repositories/placesRepo');
const repo = require('../db/repositories/placeEventsRepo');
const { isPushConfigured, sendToOwner } = require('../lib/push/sendPush');
const { formatPlaceLine, placeForwardConfig } = require('../lib/forward/placeLine');
const { postToBridge } = require('../lib/forward/postToBridge');
const { HttpError, notFound } = require('../lib/httpError');
const { withConnection } = require('../db/unitOfWork');

/**
 * Arrive and leave events from an iOS Shortcut. Mounted at `/api/place-events`
 * behind `isDeviceToken`. The event is never stored, only used to pick reminders.
 */

const router = express.Router();

const PUSH_TITLE = 'ShinPlan';
const BODY_PREFIX = { arrive: 'Arrived at', leave: 'Leaving' };

const paramsSchema = z.object({
    placeId: z.coerce.number({ error: 'placeId must be a number' }).int('placeId must be a number').positive('placeId must be a number'),
    event: z.enum(['arrive', 'leave'], { error: 'event must be arrive or leave' }),
});

// Fire and forget: the Bridge never changes the response or the reminder push.
const forwardPlaceEvent = async (conn, { ownerId, placeName, event }) => {
    const config = placeForwardConfig(process.env);
    if (!config) return;

    const text = formatPlaceLine({
        ownerName: await repo.ownerName(conn, ownerId),
        placeName,
        event,
        at: new Date(),
        timeZone: config.timeZone,
    });
    void postToBridge(config.url, config.token, { text });
};

// POST /api/place-events/:placeId/:event
router.post(
    '/:placeId/:event',
    asyncRoute(async (req, res) => {
        const { placeId, event } = paramsSchema.parse(req.params);

        const result = await withConnection(async (conn) => {
            const place = await placesRepo.findById(conn, placeId);
            if (!place || place.owner_id !== req.device.ownerId) throw notFound('Place');
            await forwardPlaceEvent(conn, { ownerId: req.device.ownerId, placeName: place.name, event });
            if (!isPushConfigured()) throw new HttpError(503, 'Push is not configured');

            const reminders = await repo.listTriggered(conn, req.device.ownerId, placeId, event, new Date());
            if (reminders.length === 0) return { matched: 0, sent: 0, failed: 0, removed: 0 };

            const body = [`${BODY_PREFIX[event]} ${place.name}`, ...reminders.map((r) => r.title)].join('\n');
            const sent = await sendToOwner(conn, req.device.ownerId, { title: PUSH_TITLE, body, url: `/reminders?place=${placeId}` });

            return { matched: reminders.length, ...sent };
        });

        res.sendData(result);
    })
);

module.exports = router;
