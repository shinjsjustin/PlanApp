'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const assertTodosOwned = require('../lib/assertTodosOwned');
const calendarDaysRepo = require('../db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../db/repositories/calendarItemsRepo');
const { badRequest, notFound } = require('../lib/httpError');
const { findOverlap, findPlacementProblem } = require('../lib/calendarPlacement');
const { toCalendarDay, toCalendarItem } = require('../lib/serializers');
const { idSchema, parseId } = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * The calendar (design section 5). Mounted at `/api/calendar` behind `isAuth`,
 * so `req.user.id` is the owner and every id the caller hands in is checked
 * against them before anything is touched.
 *
 * The calendar hangs off the user rather than off a project, so unlike every
 * other resource router here nothing is addressed by a parent: days are appended
 * to the owner's own strip.
 *
 * The cascade — what a resize pushes down, what spills into tomorrow — is not
 * here. It runs in the browser, because it has to be recomputed on every pointer
 * move to draw the drag ghost (design decision 8). What this file owes the
 * database is that whatever it stores is a *legal* calendar, which is a much
 * narrower promise and the one `lib/calendarPlacement` keeps.
 */

const router = express.Router();

const minutesSchema = z
    .number({ error: 'must be an integer number of minutes' })
    .int('must be an integer number of minutes');

/**
 * A placement names its day one of two ways, never both: `dayId` for a day that
 * exists, `dayIndex` for one this same request is about to create. The index is
 * into the day list *after* the appends, which is what lets a spill that ran out
 * of days be a single atomic request rather than a create followed by a write
 * that might not happen.
 */
const placementSchema = z
    .object({
        todoId: idSchema,
        dayId: idSchema.optional(),
        dayIndex: z
            .number({ error: 'dayIndex must be an integer of 0 or more' })
            .int('dayIndex must be an integer of 0 or more')
            .min(0, 'dayIndex must be an integer of 0 or more')
            .optional(),
        startMinutes: minutesSchema,
        durationMinutes: minutesSchema,
    })
    .refine(
        (placement) => (placement.dayId === undefined) !== (placement.dayIndex === undefined),
        { message: 'a placement must name exactly one of dayId or dayIndex' }
    );

/**
 * `appendDays` is capped at the number of placements because a day is only ever
 * created to receive something. Without the cap a single request could append
 * arbitrarily many empty columns.
 */
const bulkSchema = z
    .object({
        appendDays: z
            .number({ error: 'appendDays must be an integer of 0 or more' })
            .int('appendDays must be an integer of 0 or more')
            .min(0, 'appendDays must be an integer of 0 or more')
            .default(0),
        placements: z.array(placementSchema).default([]),
        unschedule: z.array(idSchema).default([]),
    })
    .refine((body) => body.appendDays <= body.placements.length, {
        message: 'appendDays may not exceed the number of placements',
    });

// The endpoint takes no input — a new day is untitled and goes at the end.
// Parsing an empty shape drops anything else the caller sent rather than letting
// it through unexamined.
const createDaySchema = z.object({});

/** The whole calendar in the shape the page loads: one request, one failure state. */
const readCalendar = async (conn, ownerId) => {
    const days = await calendarDaysRepo.listByOwner(conn, ownerId);
    const items = await calendarItemsRepo.listByOwner(conn, ownerId);

    return { days: days.map(toCalendarDay), items: items.map(toCalendarItem) };
};

// GET /api/calendar — days and bookings together, the way the project graph
// arrives in one piece. Read-only, so it takes a connection rather than a
// transaction.
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const calendar = await withConnection((conn) => readCalendar(conn, req.user.id));

        res.sendData(calendar);
    })
);

// POST /api/calendar/days — appends a day to the end of the owner's strip.
router.post(
    '/days',
    asyncRoute(async (req, res) => {
        createDaySchema.parse(req.body ?? {});

        const day = await withTransaction((conn) =>
            calendarDaysRepo.create(conn, { ownerId: req.user.id })
        );

        res.sendData(toCalendarDay(day), 201);
    })
);

// DELETE /api/calendar/days/:id — the day goes and its bookings are released.
// The to-dos behind them are untouched: the container goes, the work does not
// (design decision 6). That release is the schema's ON DELETE CASCADE, not code
// here.
router.delete(
    '/days/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'calendarDay', id, req.user.id);

            return calendarDaysRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Day');

        res.sendData({ id });
    })
);

module.exports = router;
