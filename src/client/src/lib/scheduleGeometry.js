// Minutes on one side, pixels on the other (design section 9).
//
// Everything the calendar draws is positioned from a time, and every gesture
// arrives as a pixel offset. This is the only place that converts between them,
// so the scale is one number rather than a factor scattered through five
// components — and every magic number in the layout has a name here instead.
//
// The scheduling constants are imported from `lib/schedule` rather than restated,
// so there is one definition of what a day and a slot are.
//
// Not to be confused with `lib/geometry.js`, which routes graph edges around the
// project canvas. Different feature, different axis, no shared arithmetic.

import { DAY_MINUTES, MIN_DURATION, SLOT_MINUTES, boundDuration } from './schedule';

/** How tall one half-hour slot is drawn. 48px an hour reads comfortably. */
export const PX_PER_SLOT = 24;

export const PX_PER_MINUTE = PX_PER_SLOT / SLOT_MINUTES;

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

export const minutesToPx = (minutes) => minutes * PX_PER_MINUTE;

export const pxToMinutes = (px) => px / PX_PER_MINUTE;

/** The nearest half hour. Everything the user drags lands on the grid. */
export const snapToSlot = (minutes) => Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;

/**
 * A start time that is on the grid and inside the day.
 *
 * The ceiling is one slot short of midnight, because a booking has to be able to
 * begin somewhere — an item dropped at 23:30 is legal and simply spills.
 */
export const clampStart = (minutes) =>
    Math.min(Math.max(snapToSlot(minutes), 0), DAY_MINUTES - MIN_DURATION);

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
 * A non-finite input comes back non-finite — `snapToSlot` turns a bad pointer
 * value into `NaN`, and `boundDuration` passes a non-number straight through.
 * That is on purpose: inventing a plausible half hour here would hide the wiring
 * bug, so the refusal happens once, at `settleDay`'s guard.
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
