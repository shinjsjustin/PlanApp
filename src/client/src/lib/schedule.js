// What a day looks like after a gesture (design section 6).
//
// Pure functions over plain data: no React, no DOM, no measurement. That is not
// tidiness, it is what makes the hardest logic in the feature testable at all —
// jsdom cannot provide the layout a rendered calendar would need, and this has
// to be exercised across dozens of cases.
//
// The same division `lib/dragDrop.js` already makes on the project page: the
// drag library answers "where did the pointer land", and everything after that
// is arithmetic that lives here.
//
// The cascade runs on the client rather than the server because it has to be
// recomputed on every pointer move to draw the drag ghost (design decision 8).
// The server does not repeat it; it checks that the layout it is handed is legal.
//
// State is `{ days: [{ id, position, ... }], items: [{ todoId, dayId,
// startMinutes, durationMinutes, ... }] }`. Days are ordered left to right.
// Items carry whatever display fields the caller put on them — this file only
// ever reads the four scheduling fields and copies the rest across untouched.

import { createTempId } from './tempIds';

/** A day is 00:00 to 24:00. Not a date: an ordered container (design decision 2). */
export const DAY_MINUTES = 1440;

/** The grid, and therefore the snap. */
export const SLOT_MINUTES = 30;

/** One slot. Nothing can be shorter and still carry a readable label. */
export const MIN_DURATION = SLOT_MINUTES;

/**
 * A full day. This is what guarantees the spill terminates: an item that has
 * been rebased to 00:00 always fits in an empty day, so every pass places at
 * least one item for good.
 */
export const MAX_DURATION = DAY_MINUTES;

/** What a drop from the pool books, before any resizing. */
export const DEFAULT_DURATION = 60;

const endOf = (item) => item.startMinutes + item.durationMinutes;

/**
 * Display order within a day: by start time, with two rules for the anchors.
 *
 * *Anchors win a tie.* Releasing exactly on an existing item's start puts the
 * anchor above it, and the fold below then pushes that item down. Without this
 * the drop would land *under* the item the pointer was over, which is the
 * opposite of what the gesture looked like.
 *
 * *Anchors sort as one block.* Every anchor is keyed by the group's earliest
 * start rather than its own, so a group stays together instead of the day's own
 * items interleaving with it. This is what a spill needs: the overflow arrives
 * rebased to 00:00 and must land on top of the receiving day as a unit. Keying
 * each anchor by its own start would let an existing item at 00:00 slot into the
 * middle of the arriving group — see the multi-anchor case in the tests.
 *
 * That second rule assumes the anchors are a *contiguous* run. Keying the group
 * by its earliest start also keys it past anything caught inside its span, so a
 * non-anchor sitting in a hole between two anchors sorts after the whole group
 * and gets pushed down — a legal free hole, thrown away. Callers pass contiguous
 * anchors: a drag or a resize anchors one item, and a spill rebases its tail to
 * 00:00 before handing it on. The cost is pinned by the non-contiguous case in
 * the tests so it stays a decision rather than a surprise.
 *
 * Ordering only. Neither rule moves anything; the fold below does that.
 */
const orderFor = (items, anchors) => {
    const anchorStarts = items
        .filter((item) => anchors.has(item.todoId))
        .map((item) => item.startMinutes);

    const groupStart = anchorStarts.length > 0 ? Math.min(...anchorStarts) : 0;

    const keyOf = (item) => (anchors.has(item.todoId) ? groupStart : item.startMinutes);

    return [...items].sort((a, b) => {
        if (keyOf(a) !== keyOf(b)) return keyOf(a) - keyOf(b);

        const aIsAnchor = anchors.has(a.todoId);
        const bIsAnchor = anchors.has(b.todoId);

        if (aIsAnchor !== bIsAnchor) return aIsAnchor ? -1 : 1;

        // Reached only for two anchors: two non-anchors with equal keys have
        // equal starts, since a non-anchor is keyed by its own start. This is
        // what keeps anchors in their own relative order within the group.
        return a.startMinutes - b.startMinutes;
    });
};

/**
 * Every item must carry a real start and a real length, because the fold below
 * is a running sum: one `undefined` or `'60'` makes the cursor `NaN`, and from
 * there every item further down the day settles to a `NaN` start. Nothing
 * downstream catches that — `endOf(item) > DAY_MINUTES` is false for `NaN`, so
 * an overflowing item would quietly fail to spill and go to the server as a
 * broken row. Cheaper to refuse the day than to explain it later.
 *
 * A duration must also be positive: a zero-length item does not advance the
 * cursor, so the next item settles on top of it, and a negative one winds the
 * cursor backwards. Either breaks the ordered, non-overlapping result that the
 * spill relies on. The floor here is "positive", not `MIN_DURATION` — a resize
 * in flight is clamped to `MIN_DURATION` by the gesture, not by this fold.
 */
const assertSchedulable = (item) => {
    if (!Number.isFinite(item.startMinutes) || !Number.isFinite(item.durationMinutes)) {
        throw new Error(
            `Item ${item.todoId} needs a number for both startMinutes and ` +
                `durationMinutes, got ${JSON.stringify(item.startMinutes)} ` +
                `and ${JSON.stringify(item.durationMinutes)}`
        );
    }

    if (item.durationMinutes <= 0) {
        throw new Error(
            `Item ${item.todoId} has a duration of ${item.durationMinutes}; ` +
                'it must be positive'
        );
    }
};

/**
 * One day, resolved so nothing overlaps — the whole push-down rule, in a fold.
 *
 * `start = max(start, cursor)` is the entire behaviour. Because a start is only
 * ever raised and never lowered, a gap survives when the item above still fits
 * above it, and is squeezed exactly when the item above grows into it — after
 * which the stack pushes. Nothing above the anchor can move, because nothing
 * above it is ever raised past its own start.
 *
 * A push can carry an item past `DAY_MINUTES`, and deliberately does: there is
 * no clamp here. Deciding what happens to an item that no longer fits in the day
 * is the spill's job, and it can only find the overrun if this leaves it in
 * place. So a returned `startMinutes` of 1500 is a result, not a bug.
 *
 * `anchorTodoIds` is what the gesture is acting on: one id for a drag or a
 * resize, a whole group for the items a spill has just carried in from the day
 * above. A bare id may be passed unwrapped. It affects ordering only, never
 * position. Ids are matched by identity, so they must be the same type as
 * `todoId` — `'1'` from a dataset attribute will not match a numeric `1`, and
 * would silently order the day as though nothing were anchored.
 *
 * Returns a new array, ordered top to bottom. Items whose start did not change
 * are passed through by reference — the array and the moved items are new, but
 * an untouched item keeps its identity, which is what lets a rendered day column
 * memoize per item and re-render only the rows that actually moved.
 */
export const settleDay = (items, anchorTodoIds = []) => {
    items.forEach(assertSchedulable);

    const anchors = new Set([].concat(anchorTodoIds));

    let cursor = 0;

    return orderFor(items, anchors).map((item) => {
        const startMinutes = Math.max(item.startMinutes, cursor);
        cursor = startMinutes + item.durationMinutes;

        return startMinutes === item.startMinutes ? item : { ...item, startMinutes };
    });
};
