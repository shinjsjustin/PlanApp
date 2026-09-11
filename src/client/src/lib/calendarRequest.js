// The settled result of a gesture, as the body `PUT /api/calendar/items` takes.
//
// A gesture is computed locally and in full, but only the difference is worth
// sending: a resize near the top of a busy day moves half a dozen bookings and
// leaves twenty alone, and the twenty do not need a round trip. The server's own
// overlap check reads what is stored rather than what was sent, so leaving the
// unchanged ones out costs nothing in safety.
//
// The other half of the job is naming days. A spill can create a day that has no
// server id yet — it is drawn immediately under a negative one — and a placement
// into it is named by its index in the day list instead, which the server
// resolves after making the appends. That is what lets a spill be one atomic
// request rather than a create followed by a write that might not happen.
//
// NO NUMERIC GUARDS HERE, and two things are why — recorded so the next reader
// does not have to redo the analysis (the rule itself is in
// `lib/scheduleGeometry`'s header). First, this module does no arithmetic at
// all: the minutes are copied through untouched, `hasMoved` compares with `!==`
// and the day lookups with `===`, so there is no `ToNumber` boundary for a bad
// field to be laundered through into a plausible number. Second, a settled state
// has already been past `settleDay`'s `assertSchedulable`, which refuses a
// booking whose `startMinutes` or `durationMinutes` is not finite — so those
// arrive guaranteed. The one precondition this module does have to check is a
// different kind, and `toBulkRequest` checks it below.

import { isTempId } from './tempIds';

/** A change in any of these is what makes a booking worth sending. */
const COMPARED_FIELDS = ['dayId', 'startMinutes', 'durationMinutes'];

// No `before` means the gesture created this booking — "moved" in the only sense
// this module cares about, which is that the server has not been told about it.
const hasMoved = (before, after) =>
    !before || COMPARED_FIELDS.some((field) => before[field] !== after[field]);

const bookingOf = (state, todoId) =>
    state.items.find((item) => item.todoId === todoId);

/**
 * `previous` is the state before the gesture and `next` the settled state after
 * it. Returns `{ appendDays, placements, unschedule }`.
 *
 * `previous` must be a *reconciled* state — one with no temp day ids. Given
 * that, `appendDays` cannot exceed `placements.length`, which the server also
 * enforces: a day is only ever appended to receive something, and whatever it
 * receives has a new `dayId` and so is always among the placements.
 *
 * Diffing against an unreconciled `previous` double-counts a day the server has
 * already been asked to create, and the bad case is the quiet one. A gesture
 * that moves some booking on a *real* day sends that placement alongside an
 * `appendDays` inherited from the stale day, which satisfies the server's bound
 * and commits — appending a phantom empty column nobody asked for, with the
 * transaction green. A rejection would be recoverable; that is not. So this
 * throws instead, the way `requireBooking` and `assertSchedulable` do, at the
 * point that still knows why.
 *
 * Scoping the count to days absent from `previous` would look tidier and be
 * worse: a placement into a pre-existing temp day still emits a `dayIndex`, and
 * the server resolves that against its own day list — correct only if the
 * in-flight request that created the day has already landed. That trades a
 * deterministic error for a race.
 */
export const toBulkRequest = (previous, next) => {
    if (previous.days.some((day) => isTempId(day.id))) {
        throw new Error(
            'toBulkRequest needs a reconciled previous state; it cannot diff ' +
                'against a day the server has not yet named'
        );
    }

    const appendDays = next.days.filter((day) => isTempId(day.id)).length;

    const placements = next.items
        .filter((item) => hasMoved(bookingOf(previous, item.todoId), item))
        .map(({ todoId, dayId, startMinutes, durationMinutes }) => {
            const where = isTempId(dayId)
                ? { dayIndex: next.days.findIndex((day) => day.id === dayId) }
                : { dayId };

            return { todoId, ...where, startMinutes, durationMinutes };
        });

    const unschedule = previous.items
        .filter((item) => !bookingOf(next, item.todoId))
        .map((item) => item.todoId);

    return { appendDays, placements, unschedule };
};
