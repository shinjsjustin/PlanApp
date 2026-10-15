'use strict';

const express = require('express');

const asyncRoute = require('../lib/asyncRoute');
const calendarDaysRepo = require('../db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../db/repositories/calendarItemsRepo');
const googleExportsRepo = require('../db/repositories/googleExportsRepo');
const { insertEvent, patchEvent, deleteEvent } = require('../lib/google/calendarApi');
const { accessTokenFor } = require('../lib/google/session');
const { exportBodies, planExport } = require('../lib/googleExportPlan');
const { timeZoneOf } = require('../lib/localDate');
const { withConnection } = require('../db/unitOfWork');

/**
 * Pushes the owner's bookings to Google as events. Mounted at
 * `/api/calendar/export` behind `isAuth`.
 */

const router = express.Router();

// POST /api/calendar/export — create, move and delete events to match the bookings.
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const userId = req.user.id;

        // Before any transaction: it may remove a dead account row, which must not roll back.
        const accessToken = await accessTokenFor(userId);

        const { days, bookings, mappings } = await withConnection(async (conn) => ({
            days: await calendarDaysRepo.listByOwner(conn, userId),
            bookings: await calendarItemsRepo.listByOwner(conn, userId),
            mappings: await googleExportsRepo.listByUser(conn, userId),
        }));
        const { creates, updates, deletes } = planExport(
            exportBodies(bookings, days, timeZoneOf(req)),
            mappings
        );

        // Each mapping is written as soon as Google answers, so a later failure
        // keeps what already exists and a re-run does not duplicate it.
        const saveMapping = (itemKey, googleEventId) =>
            withConnection((conn) => googleExportsRepo.upsert(conn, { userId, itemKey, googleEventId }));

        for (const { itemKey, body } of creates) {
            const event = await insertEvent(accessToken, body);
            await saveMapping(itemKey, event.id);
        }

        for (const { itemKey, body, googleEventId } of updates) {
            if (await patchEvent(accessToken, googleEventId, body)) continue;
            const event = await insertEvent(accessToken, body);
            await saveMapping(itemKey, event.id);
        }

        for (const { itemKey, googleEventId } of deletes) {
            await deleteEvent(accessToken, googleEventId);
            await withConnection((conn) => googleExportsRepo.remove(conn, userId, itemKey));
        }

        res.sendData({ created: creates.length, updated: updates.length, deleted: deletes.length });
    })
);

module.exports = router;
