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

import { isTempId } from './tempIds';

const SCHEDULING_FIELDS = ['dayId', 'startMinutes', 'durationMinutes'];

const hasMoved = (before, after) =>
    !before || SCHEDULING_FIELDS.some((field) => before[field] !== after[field]);

const bookingOf = (state, todoId) =>
    state.items.find((item) => item.todoId === todoId);

/**
 * `previous` is the state before the gesture and `next` the settled state after
 * it. Returns `{ appendDays, placements, unschedule }`.
 *
 * `appendDays` can never exceed `placements.length`, which the server enforces:
 * a day is only ever appended to receive something, and whatever it receives has
 * a new `dayId` and so is always among the placements.
 */
export const toBulkRequest = (previous, next) => {
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
