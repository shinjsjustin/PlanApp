'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const assertTodosOwned = require('../lib/assertTodosOwned');
const calendarDaysRepo = require('../db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../db/repositories/calendarItemsRepo');
const { badRequest, notFound } = require('../lib/httpError');
const {
    DAY_MINUTES,
    SLOT_MINUTES,
    findOverlap,
    findPlacementProblem,
} = require('../lib/calendarPlacement');
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
 * A day is 24 hours of half-hour slots, and a gesture reaches at most the days
 * on screen — a week of them, filled edge to edge, is already far past anything
 * the cascade produces. The cap is what stops one request costing an unbounded
 * amount of sorting and an unbounded `IN (...)`; without it the only bound is
 * the body parser's byte limit, which is a limit on a different thing.
 */
const MAX_BULK_ITEMS = (DAY_MINUTES / SLOT_MINUTES) * 7;

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
        placements: z
            .array(placementSchema)
            .max(MAX_BULK_ITEMS, `no more than ${MAX_BULK_ITEMS} placements in one request`)
            .default([]),
        unschedule: z
            .array(idSchema)
            .max(MAX_BULK_ITEMS, `no more than ${MAX_BULK_ITEMS} to-dos unscheduled at once`)
            .default([]),
    })
    .refine((body) => body.appendDays <= body.placements.length, {
        message: 'appendDays may not exceed the number of placements',
    })
    .refine(
        (body) => {
            const dropped = new Set(body.unschedule);

            return !body.placements.some((placement) => dropped.has(placement.todoId));
        },
        {
            // Unscheduling and placing the same to-do resolves quietly in favour
            // of the placement, because the delete runs before the upserts. That
            // is an order of instructions, not a decision anyone made, and the
            // request means two contradictory things — so refuse it, the way a
            // to-do named twice in `placements` is refused.
            message: 'a to-do may not be both unscheduled and placed in one request',
        }
    );

// The endpoint takes no input — a new day is untitled and goes at the end.
// Parsing an empty shape drops anything else the caller sent rather than letting
// it through unexamined.
const createDaySchema = z.object({});

/**
 * The whole calendar in the shape the page loads: one request, one failure state.
 *
 * That is one failure state, not one instant. The two reads are not snapshotted
 * against each other, so a day deleted between them leaves its items in the
 * payload pointing at a day that is no longer there. The client draws items into
 * the columns it was given and an item with no column simply does not appear,
 * which is what the next load shows anyway — so this is left as a race that
 * settles itself rather than paid for with a transaction on a read.
 */
const readCalendar = async (conn, ownerId, knownDays = null) => {
    // The bulk endpoint has already read the strip in order to resolve
    // `dayIndex`, and nothing touches `calendar_days` after that, so it hands
    // that list back rather than asking again.
    const days = knownDays ?? (await calendarDaysRepo.listByOwner(conn, ownerId));
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

        // Unreachable today: `assertOwnership` has already answered 404 for a
        // day that is not there, and nothing else can delete it inside this
        // transaction. Kept for the day someone moves that check outside.
        if (!deleted) throw notFound('Day');

        res.sendData({ id });
    })
);

/**
 * A stored row in the shape the validator reads. The overlap check runs on what
 * the database now holds rather than on what the request carried, so the two
 * shapes have to meet somewhere.
 */
const toPlacement = (row) => ({
    todoId: row.todo_id,
    dayId: row.day_id,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
});

/** Turns a `dayIndex` into a real day id, now that the appends have happened. */
const resolveDay = ({ todoId, dayId, dayIndex, startMinutes, durationMinutes }, days) => {
    if (dayId !== undefined) return { todoId, dayId, startMinutes, durationMinutes };

    const day = days[dayIndex];

    if (!day) throw badRequest(`dayIndex ${dayIndex} is beyond the end of the calendar`);

    return { todoId, dayId: day.id, startMinutes, durationMinutes };
};

// PUT /api/calendar/items — the settled result of one gesture, applied at once.
//
// A single drag can move a dozen bookings across three days and create a day
// that did not exist. Sent as separate requests that could half-apply, leaving a
// stray empty column or a schedule the user never asked for; one transaction
// cannot.
router.put(
    '/items',
    asyncRoute(async (req, res) => {
        const { appendDays, placements, unschedule } = bulkSchema.parse(req.body ?? {});
        const ownerId = req.user.id;

        const calendar = await withTransaction(async (conn) => {
            await assertTodosOwned(
                conn,
                [...placements.map((placement) => placement.todoId), ...unschedule],
                ownerId
            );

            // Deduped first: a gesture that fills one day names it once per item,
            // and the answer is the same every time.
            const namedDayIds = [
                ...new Set(
                    placements
                        .map((placement) => placement.dayId)
                        .filter((dayId) => dayId !== undefined)
                ),
            ];

            for (const dayId of namedDayIds) {
                // Sequential: one mysql2 connection runs one statement at a time.
                // eslint-disable-next-line no-await-in-loop
                await assertOwnership(conn, 'calendarDay', dayId, ownerId);
            }

            for (let index = 0; index < appendDays; index += 1) {
                // eslint-disable-next-line no-await-in-loop
                await calendarDaysRepo.create(conn, { ownerId });
            }

            const days = await calendarDaysRepo.listByOwner(conn, ownerId);
            const resolved = placements.map((placement) => resolveDay(placement, days));

            const problem = findPlacementProblem(resolved);
            if (problem) throw badRequest(problem);

            await calendarItemsRepo.removeByTodoIds(conn, unschedule);

            for (const placement of resolved) {
                // eslint-disable-next-line no-await-in-loop
                await calendarItemsRepo.upsert(conn, placement);
            }

            // The overlap check that counts runs on what is now stored, not on
            // what was sent. A day can hold bookings this request never mentioned
            // — everything the gesture did not move — and an item dropped on top
            // of one of those would sail through a check that only read the
            // payload. Throwing here rolls the whole call back, appended days
            // included.
            const affectedDayIds = [...new Set(resolved.map((placement) => placement.dayId))];
            const stored = await calendarItemsRepo.listByDayIds(conn, affectedDayIds);

            const overlap = findOverlap(stored.map(toPlacement));
            if (overlap) throw badRequest(overlap);

            return readCalendar(conn, ownerId, days);
        });

        res.sendData(calendar);
    })
);

// DELETE /api/calendar/items/:todoId — dragging a booking back to the pool.
// Addressed by to-do rather than by booking id because that is what the client
// holds: a to-do has at most one booking, so the two are interchangeable, and
// the to-do id is the one the pool already knows.
router.delete(
    '/items/:todoId',
    asyncRoute(async (req, res) => {
        const todoId = parseId(req.params.todoId);

        const released = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'todo', todoId, req.user.id);

            return calendarItemsRepo.removeByTodoIds(conn, [todoId]);
        });

        if (released === 0) throw notFound('Booking');

        res.sendData({ todoId });
    })
);

module.exports = router;
