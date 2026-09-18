'use strict';

/**
 * Whether a day's notes are a legal arrangement (design 2026-09-16, section 5.4).
 *
 * Beside `lib/calendarPlacement.js` and following its conventions: pure
 * functions over plain data, each returning a human-readable message or null,
 * so the whole rule set is testable without a connection.
 *
 * The rule is a count, not a layout. This file has no concept of a lane being
 * leftmost or rightmost and never assigns one — that is the browser's business
 * (`src/client/src/lib/noteLanes.js`), because it is a drawing decision that has
 * to be recomputed on every pointer move.
 *
 * What makes the two sides agree is decision 7. The client fills the
 * lowest-numbered free lane, walking notes in start order — greedy colouring of
 * an interval graph, which is optimal and therefore uses exactly as many lanes
 * as the maximum number of notes overlapping at any one minute. So "the client
 * found no free lane" and "this sweep exceeds the cap" are the same condition
 * rather than two that happen to agree today.
 *
 * `src/shared/noteLaneCases.json` is what keeps that honest across the bundle
 * boundary; see this module's test for the shape of that arrangement.
 */

/** Four lanes. Wider than this and the rotated text stops being readable. */
const MAX_NOTE_LANES = 4;

/**
 * The largest number of notes covering any single minute.
 *
 * A sweep rather than a pairwise comparison: +1 at each start, -1 at each end,
 * sorted, running maximum. Pairwise would be quadratic and would also have to
 * decide what "overlapping" means for three notes that pairwise overlap but
 * never coincide — a question the sweep does not have to ask.
 *
 * Ends sort before starts at the same minute, which is what makes contact
 * non-overlapping: a note ending at 10:00 and one starting at 10:00 may share a
 * lane, so the -1 must land first or the count would briefly read 2.
 *
 * Assumes `durationMinutes > 0`. A zero-duration note's start and end land on
 * the same minute, and that same ends-before-starts tie-break cancels its +1
 * before `running` ever sees it — the note is invisible for its whole
 * existence, not just at its boundary. This file does not guard against that;
 * the notes router's minimum duration does, the same way `routes/calendar.js`
 * owns the arithmetic this module never re-checks.
 */
const maxOverlap = (notes) => {
    const events = notes.flatMap((note) => [
        { at: note.startMinutes, delta: 1 },
        { at: note.startMinutes + note.durationMinutes, delta: -1 },
    ]);

    events.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.delta - b.delta));

    let running = 0;
    let highest = 0;

    for (const event of events) {
        running += event.delta;
        if (running > highest) highest = running;
    }

    return highest;
};

/**
 * The cap, as a message or null.
 *
 * Runs on what is *now stored* rather than on what a request carried. A day
 * holds notes the request never mentioned, and a check that read only the
 * payload would sail straight past them — the same rule `routes/calendar.js`
 * applies to booking overlap, for the same reason.
 */
const findLaneProblem = (notes) => {
    const overlap = maxOverlap(notes);

    if (overlap <= MAX_NOTE_LANES) return null;

    return (
        `a day may hold at most ${MAX_NOTE_LANES} notes overlapping at once; ` +
        `this would make ${overlap}`
    );
};

module.exports = { MAX_NOTE_LANES, findLaneProblem, maxOverlap };
