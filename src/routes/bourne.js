'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const { listPrimaryEvents } = require('../lib/google/calendarApi');
const { listFiles, readFile } = require('../lib/google/driveApi');
const { accessTokenFor } = require('../lib/google/session');
const { eventsInRange, rangeWindow } = require('../lib/googleEventWindow');
const assertOwnership = require('../middleware/assertOwnership');
const placesRepo = require('../db/repositories/placesRepo');
const { withConnection } = require('../db/unitOfWork');
const { travelBetween, mapsUrlFor } = require('../lib/travelTime');
const { placesPayload } = require('../lib/startPlace');
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

// GET /api/bourne/places — the same payload as GET /api/places.
router.get(
    '/places',
    asyncRoute(async (req, res) => {
        res.sendData(await placesPayload(req.user.id));
    })
);

const placeId = z.coerce.number().int().positive();

const travelSchema = z.object({
    from: placeId,
    to: placeId,
    departAt: z.string().datetime({ offset: true }),
});

const loadOwnedPlace = async (conn, id, userId) => {
    await assertOwnership(conn, 'place', id, userId);
    return placesRepo.findById(conn, id);
};

// GET /api/bourne/travel?from=&to=&departAt= — the drive between two saved places.
router.get(
    '/travel',
    asyncRoute(async (req, res) => {
        const { from, to, departAt } = travelSchema.parse(req.query);

        const [origin, destination] = await withConnection(async (conn) => [
            await loadOwnedPlace(conn, from, req.user.id),
            await loadOwnedPlace(conn, to, req.user.id),
        ]);

        const result =
            from === to
                ? {
                      status: 'ok',
                      durationSeconds: 0,
                      distanceMeters: 0,
                      mapsUrl: mapsUrlFor(origin.address, destination.address),
                  }
                : await travelBetween({
                      originAddress: origin.address,
                      destinationAddress: destination.address,
                      departAt: new Date(departAt),
                      timeZone: timeZoneOf(req),
                      now: new Date(),
                  });

        res.sendData({ from, to, departAt, ...result });
    })
);

const MAX_SEARCH_LENGTH = 200;
const MAX_PAGE_TOKEN_LENGTH = 1024;

const listSchema = z.object({
    search: z.string().min(1).max(MAX_SEARCH_LENGTH).optional(),
    pageToken: z.string().max(MAX_PAGE_TOKEN_LENGTH).optional(),
});

const fileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);

// GET /api/bourne/drive/files?search=&pageToken= — one page of Drive files.
router.get(
    '/drive/files',
    asyncRoute(async (req, res) => {
        const query = listSchema.parse(req.query);

        const accessToken = await accessTokenFor(req.user.id);
        const { files, nextPageToken } = await listFiles(accessToken, query);

        res.sendData({ files, nextPageToken });
    })
);

// GET /api/bourne/drive/files/:fileId — one file's metadata and text.
router.get(
    '/drive/files/:fileId',
    asyncRoute(async (req, res) => {
        const fileId = fileIdSchema.parse(req.params.fileId);

        const accessToken = await accessTokenFor(req.user.id);

        res.sendData(await readFile(accessToken, fileId));
    })
);

module.exports = router;
