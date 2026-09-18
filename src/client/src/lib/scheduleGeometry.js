// Minutes on one side, pixels on the other, and the clock face for both
// (design section 9).
//
// Everything the calendar draws is positioned from a time, and every gesture
// arrives as a pixel offset. This is the only place that converts between them,
// so the scale is decided in one place rather than scattered through five
// components — and every magic number in the layout has a name here instead.
// The scale itself is no longer a constant: it is derived from the window by
// `hooks/useDayScale` and bound into a geometry by `createDayGeometry` below.
// Reading a time back out is the same job seen from the other end: `formatTime`
// and `hourLabels` render the gutter ruler, whose `minutes` feed straight back
// into `minutesToPx` to position it.
//
// The scheduling constants are imported from `lib/schedule` rather than restated,
// so there is one definition of what a day and a slot are.
//
// WHERE THE GUARDS GO. At a parameter a non-number can actually reach — not at
// every operator that coerces. `/`, `Math.min` and `Math.max` all run `ToNumber`,
// but an operator only says a boundary *exists*; the call sites say whether
// anything can arrive at it.
//
// A parameter fed a field read off an object — a drag payload, an API response,
// `dataTransfer` — is open, and is guarded. A parameter fed the result of
// arithmetic is closed *only if that arithmetic's own operands are*. The second
// half of that clause is the one that matters, because `+` and `-` launder a bad
// field into a plausible number before anything downstream can refuse it:
// `item.durationMinutes + 30` is still open, since `null + 30` is `30`.
//
// So `pxToMinutes(activeRect.top - gridRect.top)` needs nothing — both operands
// are measured numbers. `snapToSlot` and `clampStart` are guarded, because the
// gestures also hand them values that came off a payload, and there the guard is
// the difference between a refusal and a saved booking. And where the operands
// of the sum are themselves open, no guard *here* can help: the `+` ran first, so
// the check belongs upstream on the object, not on the parameter that receives
// the total.

import { DAY_MINUTES, MIN_DURATION, SLOT_MINUTES, boundDuration } from './schedule';

/**
 * The smallest the scale ever gets, and the one the calendar drew at when it was
 * fixed. 48px an hour reads comfortably.
 *
 * A floor rather than a value, because the priority is showing more hours rather
 * than fitting a whole day: on a short window the column fills the page at this
 * scale and the rest scrolls inside, and only a window tall enough for all 24
 * hours makes the scale grow (design 2026-09-16, decision 10).
 */
export const PX_PER_SLOT_MIN = 24;

export const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES;

/**
 * The two conversions that depend on how tall a slot is drawn, bound to one
 * scale.
 *
 * A factory rather than a `pxPerSlot` parameter on each converter, and that is a
 * decision about this file's guards as much as about its ergonomics. Every note
 * in the header above reasons about which parameters are open to a value read
 * off a payload; adding a second parameter to `minutesToPx` and `pxToMinutes`
 * would open a new boundary at each call site and make that analysis something
 * to redo. Bound once, at the one place that measures, there is no new boundary
 * — and a caller cannot forget the argument, because there is no argument.
 *
 * `snapToSlot`, `clampStart`, `clampDuration`, `formatTime` and `hourLabels` are
 * all scale-independent and stay module-level exports, so everything the header
 * says about them is still true.
 *
 * `pxPerSlot` is carried on the result so a consumer can tell two geometries
 * apart — which is what lets a memo key on the scale rather than on the object.
 *
 * `pxPerSlot` itself is unguarded, and the header's rule is why: it is never a
 * field read off a payload. The literal `PX_PER_SLOT_MIN` and `useDayScale`'s
 * `scaleFor` — already `Math.max`-clamped to that floor — are its only two
 * callers, so nothing reaches this parameter that a guard here would refuse.
 */
export const createDayGeometry = (pxPerSlot) => {
    const pxPerMinute = pxPerSlot / SLOT_MINUTES;

    return {
        pxPerSlot,

        /**
         * Unguarded, and the header's rule is why: both are fed the result of
         * arithmetic — a rect subtraction, a pointer delta — never a field read
         * off a payload. The worst case is `NaN`, which propagates safely into a
         * clamp that refuses it.
         */
        minutesToPx: (minutes) => minutes * pxPerMinute,
        pxToMinutes: (px) => px / pxPerMinute,

        dayHeightPx: pxPerSlot * SLOTS_PER_DAY,
    };
};

/**
 * Where a column is scrolled to when it first appears: 06:00 at the top.
 *
 * A 24-hour column is 1152px tall and most of the top of it is empty. Opening at
 * midnight would mean every user scrolls before they can do anything.
 */
export const INITIAL_SCROLL_MINUTES = 360;

const MINUTES_PER_HOUR = 60;

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
