// Minutes on one side, pixels on the other, and the clock face for both
// (design section 9).
//
// Everything the calendar draws is positioned from a time, and every gesture
// arrives as a pixel offset. This is the only place that converts between them,
// so the scale is one number rather than a factor scattered through five
// components — and every magic number in the layout has a name here instead.
// Reading a time back out is the same job seen from the other end: `formatTime`
// and `hourLabels` render the gutter ruler, whose `minutes` feed straight back
// into `minutesToPx` to position it.
//
// The scheduling constants are imported from `lib/schedule` rather than restated,
// so there is one definition of what a day and a slot are.
//
// WHERE THE GUARDS GO. At a parameter fed from a source that can supply a
// non-number — not at every operator that coerces. `/`, `Math.min` and `Math.max`
// all run `ToNumber`, but an operator only tells you a boundary *exists*; the
// call sites tell you whether a non-number can *reach* it. A parameter fed a
// field read off an object — a drag payload, an API response, `dataTransfer` —
// is open, and that is where the guard belongs. A parameter fed the result of
// arithmetic is already closed over `number` and needs none. So `snapToSlot` and
// `clampStart` are guarded and `minutesToPx`/`pxToMinutes` are not; if a later
// gesture ever hands one of those a raw field instead of a subtraction, that is
// the moment it needs a guard, and this rule is what says so.
//
// Not to be confused with `lib/geometry.js`, which routes graph edges around the
// project canvas. Different feature, different axis, no shared arithmetic.

import { DAY_MINUTES, MIN_DURATION, SLOT_MINUTES, boundDuration } from './schedule';

/** How tall one half-hour slot is drawn. 48px an hour reads comfortably. */
export const PX_PER_SLOT = 24;

/** Not exported: nothing outside converts by the minute, it calls the two below. */
const PX_PER_MINUTE = PX_PER_SLOT / SLOT_MINUTES;

export const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES;

export const DAY_HEIGHT_PX = SLOTS_PER_DAY * PX_PER_SLOT;

/**
 * Where a column is scrolled to when it first appears: 06:00 at the top.
 *
 * A 24-hour column is 1152px tall and most of the top of it is empty. Opening at
 * midnight would mean every user scrolls before they can do anything.
 */
export const INITIAL_SCROLL_MINUTES = 360;

const MINUTES_PER_HOUR = 60;

/**
 * The two unguarded functions in the file, and the header's rule says why: both
 * are fed the result of arithmetic — a rect subtraction, a pointer delta — never
 * a field read off a payload. Subtraction in JavaScript either returns a `number`
 * or throws, so it cannot hand back a non-number for the `*` or `/` here to
 * coerce; the worst it produces is `NaN`, which propagates safely into a clamp
 * that refuses it. A `Number.isFinite` ternary here would be unreachable.
 */
export const minutesToPx = (minutes) => minutes * PX_PER_MINUTE;

export const pxToMinutes = (px) => px / PX_PER_MINUTE;

/**
 * The nearest half hour. Everything the user drags lands on the grid.
 *
 * Anything that is not already a real number is returned untouched, and the
 * `Number.isFinite` test is what makes that true rather than merely intended.
 * `/` runs `ToNumber` on its operands, so snapping `null` unguarded returns `0` —
 * and a `0` is indistinguishable from a real midnight by the time anything
 * downstream sees it. This is the same boundary `boundDuration` guards one layer
 * down (see its note in `lib/schedule`); a guard there is worth nothing if this
 * function has already manufactured a number on the way in.
 */
export const snapToSlot = (minutes) =>
    Number.isFinite(minutes) ? Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES : minutes;

/**
 * A start time that is on the grid and inside the day.
 *
 * The ceiling is one slot short of midnight, because a booking has to be able to
 * begin somewhere — an item dropped at 23:30 is legal and simply spills.
 *
 * Guarded after the snap as well as inside it. `Math.min`/`Math.max` are a
 * second `ToNumber` boundary, so a snapped-through non-number would be coerced
 * here instead — `true` would bound to `1`, an off-grid start that no gesture
 * could have produced. `clampDuration` needs no such guard only because
 * `boundDuration` already carries one.
 */
export const clampStart = (minutes) => {
    const snapped = snapToSlot(minutes);

    if (!Number.isFinite(snapped)) return snapped;

    return Math.min(Math.max(snapped, 0), DAY_MINUTES - MIN_DURATION);
};

/**
 * A duration that is on the grid and between one slot and one day.
 *
 * The snap is here; the bounds come from `lib/schedule`. Those bounds are what
 * `settleDay` and `spillFrom` rely on, so they stay defined once beside the
 * constants they read rather than being restated here where two copies could
 * drift. The snap is pointer arithmetic and belongs on this side.
 *
 * Deliberately *not* clamped to what is left of the day below the item. How long
 * a booking is and where it fits are different questions: an item resized past
 * 24:00 is not an error to be prevented, it is the input to the spill.
 *
 * Anything that is not a real number comes back unchanged: `snapToSlot` passes
 * it through and `boundDuration` passes it through again. That is on purpose.
 * Inventing a plausible half hour here would hide the wiring bug that produced
 * it — a `null` duration on a drag payload would be booked and saved as 30
 * minutes — so this layer snaps and bounds real numbers and touches nothing
 * else, and the refusal happens once, downstream. Which guard refuses depends on
 * the shape: a non-number is refused by `settleDay`'s `assertSchedulable`, while
 * `Infinity` reaches `spillFrom`'s `assertFitsInADay` first and reports as a
 * bounds violation rather than a type one.
 */
export const clampDuration = (minutes) => boundDuration(snapToSlot(minutes));

/**
 * A zero-padded 24-hour clock. 1440 reads as "24:00" rather than "00:00" so the
 * end of a booking that finishes the day says so.
 */
export const formatTime = (minutes) => {
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;

    return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

/** The gutter labels down the side of a column, one an hour. */
export const hourLabels = () =>
    Array.from({ length: DAY_MINUTES / MINUTES_PER_HOUR }, (unused, hour) => {
        const minutes = hour * MINUTES_PER_HOUR;

        return { minutes, label: formatTime(minutes) };
    });
