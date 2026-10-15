'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const { listPrimaryEvents } = require('../lib/google/calendarApi');
const { accessTokenFor } = require('../lib/google/session');
const { eventsInRange, rangeWindow } = require('../lib/googleEventWindow');
const { addDays, isDateKey, timeZoneOf } = require('../lib/localDate');

/**
 * Read-only Google routes for Bourne. Mounted at `/api/bourne` behind `isAuth`.
 */

const router = express.Router();

const MAX_RANGE_DAYS = 366;

const dateKey = z.string().refine(isDateKey, 'must be a real YYYY-MM-DD date');

const rangeSchema = z
    .object({ from: dateKey, to: dateKey })
    .refine(({ from, to }) => to >= from, 'to must not be before from')
    .refine(({ from, to }) => to <= addDays(from, MAX_RANGE_DAYS), `range must not exceed ${MAX_RANGE_DAYS} days`);

// GET /api/bourne/calendar/events?from=&to= — Google events overlapping the range.
router.get(
    '/calendar/events',
    asyncRoute(async (req, res) => {
        const { from, to } = rangeSchema.parse(req.query);

        const accessToken = await accessTokenFor(req.user.id);
        const googleEvents = await listPrimaryEvents(accessToken, rangeWindow(from, to));

        res.sendData({ events: eventsInRange(googleEvents, from, to, timeZoneOf(req)) });
    })
);

module.exports = router;
