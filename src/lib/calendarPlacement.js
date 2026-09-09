'use strict';

/**
 * Whether a set of bookings is a legal calendar (design section 5).
 *
 * The server does not recompute the cascade and does not check that the client's
 * arithmetic followed the push-down rules — that logic lives in the browser,
 * because it has to run on every pointer move to draw the drag ghost (design
 * decision 8). What the server owes the database is narrower and absolute: the
 * layout it stores must be one that could exist. A client that computes badly
 * can produce a schedule the user did not intend; it cannot produce a corrupt
 * one.
 *
 * Pure functions over plain data, so the whole rule set is testable without a
 * connection. Each returns a human-readable message, or null when there is no
 * problem — null meaning "nothing wrong" reads oddly for one call and very well
 * for a chain of them.
 */

const DAY_MINUTES = 1440;
const SLOT_MINUTES = 30;
const MIN_DURATION = 30;

const isSlotAligned = (value) => Number.isInteger(value) && value % SLOT_MINUTES === 0;

const endOf = (item) => item.startMinutes + item.durationMinutes;

/** The arithmetic of one booking, in isolation. */
const validatePlacement = ({ todoId, startMinutes, durationMinutes }) => {
    const at = `(to-do ${todoId})`;

    if (!isSlotAligned(startMinutes)) {
        return `startMinutes must be a multiple of ${SLOT_MINUTES} ${at}`;
    }
    if (!isSlotAligned(durationMinutes)) {
        return `durationMinutes must be a multiple of ${SLOT_MINUTES} ${at}`;
    }
    if (startMinutes < 0) return `startMinutes must be 0 or more ${at}`;
    if (durationMinutes < MIN_DURATION) {
        return `durationMinutes must be at least ${MIN_DURATION} ${at}`;
    }
    if (durationMinutes > DAY_MINUTES) {
        return `durationMinutes must be at most ${DAY_MINUTES} ${at}`;
    }
    if (endOf({ startMinutes, durationMinutes }) > DAY_MINUTES) {
        return `a booking may not run past the end of its day ${at}`;
    }

    return null;
};

/**
 * A to-do named twice.
 *
 * `uq_calendar_items_todo` would enforce this anyway, but silently: the second
 * upsert would overwrite the first and the request would answer 200 having
 * stored half of what it was sent. Catching it here turns that into a 400 that
 * says so.
 */
const findDuplicateTodo = (placements) => {
    const seen = new Set();

    for (const { todoId } of placements) {
        if (seen.has(todoId)) return `to-do ${todoId} appears in more than one placement`;
        seen.add(todoId);
    }

    return null;
};

const groupByDay = (placements) =>
    placements.reduce((byDay, placement) => {
        const bucket = byDay.get(placement.dayId) ?? [];
        byDay.set(placement.dayId, [...bucket, placement]);

        return byDay;
    }, new Map());

/**
 * Two bookings occupying the same minute of the same day.
 *
 * Touching is not overlapping: a booking ending at 10:00 and one starting at
 * 10:00 are exactly what the push-down cascade produces when it squeezes a gap
 * shut, so the comparison is strict.
 */
const findOverlap = (placements) => {
    for (const [dayId, items] of groupByDay(placements)) {
        const ordered = [...items].sort((a, b) => a.startMinutes - b.startMinutes);

        for (let index = 1; index < ordered.length; index += 1) {
            const previous = ordered[index - 1];
            const current = ordered[index];

            if (current.startMinutes < endOf(previous)) {
                return (
                    `to-dos ${previous.todoId} and ${current.todoId} ` +
                    `overlap in day ${dayId}`
                );
            }
        }
    }

    return null;
};

/** The first problem with a resolved placement set, or null. */
const findPlacementProblem = (placements) => {
    const duplicate = findDuplicateTodo(placements);
    if (duplicate) return duplicate;

    for (const placement of placements) {
        const problem = validatePlacement(placement);
        if (problem) return problem;
    }

    return findOverlap(placements);
};

module.exports = {
    DAY_MINUTES,
    MIN_DURATION,
    SLOT_MINUTES,
    findOverlap,
    findPlacementProblem,
    validatePlacement,
};
