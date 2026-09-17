// Which vertical track each note in a day is drawn in (design 2026-09-16,
// decisions 4-7).
//
// Pure — no React, no DOM, no measurement — the same bargain `lib/schedule.js`
// makes, and for the same reason: this runs on every pointer move of a create,
// a move and a resize, and it has to be testable without a rendered column.
//
// Notes are free-floating. Unlike bookings, nothing here moves anything: a note
// keeps the start and the length it was given, and the only question is which of
// four lanes it is drawn in. That is why this file is arithmetic over a day
// rather than a cascade, and why it has no counterpart to `settleDay`.
//
// LANE 0 IS RIGHTMOST, adjacent to the to-do plane, so the two planes build
// outward from the boundary between them (decision 6). Nothing in this file
// knows that — it hands out the lowest free number and the stylesheet decides
// which side of the column that is. Keeping the direction in one place means
// flipping it is a CSS change, not an arithmetic one.

import { DAY_MINUTES } from './schedule';

/**
 * Four lanes, and a fifth overlapping note is refused rather than accommodated
 * (decision 4). Lanes that subdivided indefinitely would reach a width where the
 * rotated text stops being readable, and a calendar that silently becomes
 * illegible is worse than one that says no.
 *
 * Also stated in `src/lib/calendarNoteLanes.js`, which the client bundle cannot
 * import — the same split `DAY_MINUTES` and `SLOT_MINUTES` already have between
 * `lib/schedule.js` and `lib/calendarPlacement.js`. `src/shared/noteLaneCases.json`
 * is what holds the two copies together.
 */
export const MAX_NOTE_LANES = 4;

const endOf = (note) => note.startMinutes + note.durationMinutes;

/**
 * Two notes overlap when one begins before the other ends.
 *
 * Strict on both sides, so contact is not overlap: a note ending at 10:00 and
 * one starting at 10:00 may share a lane. Without that, a day of back-to-back
 * half-hour notes would consume every lane and refuse the fifth.
 */
const overlaps = (a, b) => a.startMinutes < endOf(b) && b.startMinutes < endOf(a);

/**
 * Day's notes → `Map(noteId → lane)`.
 *
 * Greedy colouring: walk the notes in `(startMinutes, id)` order and give each
 * the lowest-numbered lane none of whose occupants it overlaps. On an interval
 * graph that is optimal — it uses exactly as many lanes as the maximum number of
 * notes covering any one minute — which is what makes this and the server's
 * overlap sweep the same rule rather than two that agree by luck (decision 7).
 *
 * The `id` tie-break is what makes the arrangement stable. Two notes starting at
 * the same minute must not swap lanes between renders, or a ribbon would jump
 * sideways when something unrelated changed.
 *
 * A note with no free lane maps to `null` rather than being left out, so a
 * caller iterating the map still sees it and can draw it as unplaceable. Every
 * client gesture is refused before it can produce one (see `canPlace`), so this
 * only arises from data that got past the server — a stale tab, or a hand-edited
 * row. Drawing it wrongly beats not drawing it at all.
 *
 * Sorts a copy; the array it is given is untouched.
 */
export const assignLanes = (notes) => {
    const ordered = [...notes].sort(
        (a, b) => a.startMinutes - b.startMinutes || a.id - b.id
    );

    // lane index → the notes already placed in it
    const lanes = Array.from({ length: MAX_NOTE_LANES }, () => []);
    const assigned = new Map();

    for (const note of ordered) {
        const lane = lanes.findIndex(
            (occupants) => !occupants.some((other) => overlaps(other, note))
        );

        if (lane === -1) {
            assigned.set(note.id, null);
            continue;
        }

        lanes[lane].push(note);
        assigned.set(note.id, lane);
    }

    return assigned;
};

/**
 * Whether a note could be placed as described — the live refusal behind every
 * gesture.
 *
 * `candidate`'s own id is excluded from `notes` first, which is the whole point
 * of the function: a note being moved or resized is tested against its siblings,
 * never against the row it is about to replace. Counted twice, resizing one of
 * four overlapping notes would refuse itself.
 *
 * The day bounds are checked here too (decision 8). They belong with the lane
 * question rather than beside it because a gesture asks one thing — "may I put
 * it here?" — and a caller that had to remember to ask two would eventually
 * forget one.
 *
 * `candidate.id` may be absent, which is what a note being created looks like.
 * Nothing is then excluded, which is correct: it has no row to replace.
 */
export const canPlace = (notes, candidate) => {
    if (candidate.startMinutes < 0) return false;
    if (endOf(candidate) > DAY_MINUTES) return false;

    const siblings = notes.filter((note) => note.id !== candidate.id);
    const lanes = assignLanes([...siblings, candidate]);

    return lanes.get(candidate.id) !== null;
};
