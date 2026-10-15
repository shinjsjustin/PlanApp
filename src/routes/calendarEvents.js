'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const calendarDaysRepo = require('../db/repositories/calendarDaysRepo');
const calendarEventsRepo = require('../db/repositories/calendarEventsRepo');
const { listPrimaryEvents } = require('../lib/google/calendarApi');
const { accessTokenFor } = require('../lib/google/session');
const { eventsToDayRows, importWindow } = require('../lib/googleEventRows');
const { timeZoneOf } = require('../lib/localDate');
const { toCalendarEvent } = require('../lib/serializers');
const { idSchema } = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * Read-only copies of Google events on the owner's days. Mounted at
 * `/api/calendar/events` behind `isAuth`.
 */

const router = express.Router();

const importSchema = z.object({ dayId: idSchema.optional() });

// GET /api/calendar/events — every imported event in the owner's calendar.
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const events = await withConnection((conn) =>
            calendarEventsRepo.listByOwner(conn, req.user.id)
        );

        res.sendData({ events: events.map(toCalendarEvent) });
    })
);

// POST /api/calendar/events/import — refresh one day, or every dated day.
router.post(
    '/import',
    asyncRoute(async (req, res) => {
        const { dayId } = importSchema.parse(req.body ?? {});
        const userId = req.user.id;

        if (dayId !== undefined) {
            await withConnection((conn) => assertOwnership(conn, 'calendarDay', dayId, userId));
        }

        // Before any transaction: it may remove a dead account row, which must not roll back.
        const accessToken = await accessTokenFor(userId);

        const days = await withConnection((conn) => calendarDaysRepo.listByOwner(conn, userId));
        const requested = days.filter((day) => day.date && (dayId === undefined || day.id === dayId));

        if (requested.length > 0) {
            const timeZone = timeZoneOf(req);
            const googleEvents = await listPrimaryEvents(accessToken, importWindow(requested));
            const rows = eventsToDayRows(googleEvents, requested, timeZone);

            await withTransaction(async (conn) => {
                for (const day of requested) {
                    await calendarEventsRepo.replaceForDay(
                        conn,
                        day.id,
                        rows.filter((row) => row.dayId === day.id)
                    );
                }
            });
        }

        const events = await withConnection((conn) => calendarEventsRepo.listByOwner(conn, userId));
        res.sendData({ events: events.map(toCalendarEvent) });
    })
);

module.exports = router;
