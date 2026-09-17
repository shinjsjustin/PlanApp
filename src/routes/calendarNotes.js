'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const calendarNotesRepo = require('../db/repositories/calendarNotesRepo');
const { badRequest, notFound } = require('../lib/httpError');
const { findLaneProblem } = require('../lib/calendarNoteLanes');
const { toCalendarNote } = require('../lib/serializers');
const { idSchema, parseId } = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * Notes (design 2026-09-16, section 5). Mounted at `/api/calendar/notes` behind
 * `isAuth`, so `req.user.id` is the owner and every id the caller hands in is
 * checked against them before anything is touched.
 *
 * Plain REST, deliberately, where bookings get a bulk endpoint. `PUT
 * /api/calendar/items` is bulk and atomic because one booking gesture settles a
 * whole day, can move a dozen rows across three days, and can invent a day that
 * did not exist. None of that is true of a note: notes do not cascade and do not
 * spill (decisions 2 and 8), so **a note gesture touches exactly one row and can
 * never create a day**. Routing it through the bulk endpoint would buy nothing
 * and would hand the cascade a notes dimension it has no use for.
 *
 * What this file owes the database is the same narrow promise `routes/calendar.js`
 * makes: whatever it stores is a *legal* day. For notes that is two things — the
 * arithmetic of one note, and the four-lane cap across the day.
 */

const router = express.Router();

const DAY_MINUTES = 1440;
const SLOT_MINUTES = 30;
const MIN_DURATION = 30;
const MAX_TEXT_LENGTH = 500;

const slotAlignedSchema = (label) =>
    z
        .number({ error: `${label} must be an integer number of minutes` })
        .int(`${label} must be an integer number of minutes`)
        .refine((value) => value % SLOT_MINUTES === 0, {
            message: `${label} must be a multiple of ${SLOT_MINUTES}`,
        });

const startSchema = slotAlignedSchema('startMinutes').min(0, 'startMinutes must be 0 or more');

const durationSchema = slotAlignedSchema('durationMinutes')
    .min(MIN_DURATION, `durationMinutes must be at least ${MIN_DURATION}`)
    .max(DAY_MINUTES, `durationMinutes must be at most ${DAY_MINUTES}`);

/**
 * Trimmed before it is measured, so a note of nothing but spaces is empty rather
 * than three characters long.
 */
const textSchema = z
    .string({ error: 'text must be a string' })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: 'text must not be empty' })
    .refine((value) => value.length <= MAX_TEXT_LENGTH, {
        message: `text must be at most ${MAX_TEXT_LENGTH} characters`,
    });

const createSchema = z.object({
    dayId: idSchema,
    text: textSchema,
    startMinutes: startSchema,
    durationMinutes: durationSchema,
});

/**
 * Every field optional, but not all of them at once: an empty body means the
 * caller has asked for nothing, which is a mistake worth reporting rather than a
 * write to perform.
 */
const updateSchema = z
    .object({
        dayId: idSchema.optional(),
        text: textSchema.optional(),
        startMinutes: startSchema.optional(),
        durationMinutes: durationSchema.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
        message: 'name at least one field to change',
    });

/**
 * A note may not run past midnight (decision 8).
 *
 * Checked against the *resulting* note rather than against the request, because
 * a `PATCH` may move only one of the two numbers: a note lengthened without
 * being moved, or moved without being lengthened, can each fall off the end of
 * the day on their own.
 */
const assertWithinDay = ({ startMinutes, durationMinutes }) => {
    if (startMinutes + durationMinutes > DAY_MINUTES) {
        throw badRequest(
            `a note must end by the end of its day; this one would end at ` +
                `${startMinutes + durationMinutes} minutes`
        );
    }
};

/**
 * The cap, read back off the database after the write and inside the same
 * transaction, so a violation rolls the write away.
 *
 * Only the day the note has landed in is checked. A move also empties a slot in
 * the day it left, and removing a note can never raise that day's maximum
 * overlap — so re-reading it would always pass and cost a query. `DELETE` is not
 * checked at all, for the same reason.
 */
const assertLanesFit = async (conn, dayId) => {
    const stored = await calendarNotesRepo.listByDayId(conn, dayId);

    const problem = findLaneProblem(
        stored.map((row) => ({
            id: row.id,
            startMinutes: row.start_minutes,
            durationMinutes: row.duration_minutes,
        }))
    );

    if (problem) throw badRequest(problem);
};

// GET /api/calendar/notes — every note in the owner's calendar.
//
// Its own request rather than a field on `GET /api/calendar`, because the page
// loads it with its own hook and reports its own failure: a strip whose notes
// failed to load is still a usable calendar (design section 7.1).
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const notes = await withConnection((conn) =>
            calendarNotesRepo.listByOwner(conn, req.user.id)
        );

        res.sendData({ notes: notes.map(toCalendarNote) });
    })
);

// POST /api/calendar/notes — a new note in a day.
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const { dayId, text, startMinutes, durationMinutes } = createSchema.parse(req.body ?? {});

        assertWithinDay({ startMinutes, durationMinutes });

        const note = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'calendarDay', dayId, req.user.id);

            const created = await calendarNotesRepo.create(conn, {
                dayId,
                text,
                startMinutes,
                durationMinutes,
            });

            await assertLanesFit(conn, dayId);

            return created;
        });

        res.sendData(toCalendarNote(note), 201);
    })
);

// PATCH /api/calendar/notes/:id — rename, move, or resize.
//
// One endpoint for all three because they are one row write. Which fields a
// gesture happens to send is the client's business, not a reason for three
// routes that would each repeat the same ownership and cap checks.
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const fields = updateSchema.parse(req.body ?? {});

        const note = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'calendarNote', id, req.user.id);

            // A move names a day that has never been checked against this user.
            // Without this, a note could be walked into a stranger's calendar.
            if (fields.dayId !== undefined) {
                await assertOwnership(conn, 'calendarDay', fields.dayId, req.user.id);
            }

            const existing = await calendarNotesRepo.findById(conn, id);
            if (!existing) throw notFound('Note');

            assertWithinDay({
                startMinutes: fields.startMinutes ?? existing.start_minutes,
                durationMinutes: fields.durationMinutes ?? existing.duration_minutes,
            });

            const updated = await calendarNotesRepo.update(conn, id, fields);
            if (!updated) throw notFound('Note');

            await assertLanesFit(conn, updated.day_id);

            return updated;
        });

        res.sendData(toCalendarNote(note));
    })
);

// DELETE /api/calendar/notes/:id — the popover's Delete.
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'calendarNote', id, req.user.id);

            return calendarNotesRepo.remove(conn, id);
        });

        // Unreachable today: `assertOwnership` has already answered 404 for a
        // note that is not there, and nothing else can delete it inside this
        // transaction. Kept for the day someone moves that check outside — the
        // same backstop `DELETE /calendar/days/:id` carries.
        if (!deleted) throw notFound('Note');

        res.sendData({ id });
    })
);

module.exports = router;
