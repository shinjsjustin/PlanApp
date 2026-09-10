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

/**
 * A duration held to what a booking may legally be: at least one slot, at most
 * one day.
 *
 * Both bounds are load-bearing rather than cosmetic. `settleDay` refuses a
 * non-positive duration and `spillFrom` refuses one longer than a day, because
 * either breaks the arithmetic underneath them. Bounding is what stops a gesture
 * being the thing that violates them — see the note above the gestures for why a
 * gesture in particular must not.
 *
 * It bounds; it does not validate, and the `Number.isFinite` test is what makes
 * that true rather than merely intended. `Math.max` runs `ToNumber` on its
 * arguments, so bounding `null` unguarded returns `30` — an absent duration on a
 * drag payload, the likeliest wiring bug there is, would book half an hour and
 * save it. Anything that is not already a real number is passed straight through
 * instead, for `assertSchedulable` to refuse. One guard, in one place.
 *
 * It does not snap, either. `lib/scheduleGeometry` needs a duration that is
 * bounded *and* on the grid, to size a resize ghost while the pointer is still
 * down; it composes its `clampDuration` as `boundDuration(snapToSlot(minutes))`.
 * The bounds are defined once, here beside the constants they read; the snap
 * belongs with the pointer arithmetic that needs it, and stays there. That
 * composition is safe in that order because both bounds are themselves multiples
 * of `SLOT_MINUTES`: bounding a snapped duration returns it, `MIN_DURATION` or
 * `MAX_DURATION`, and all three are on the grid.
 */
export const boundDuration = (durationMinutes) =>
    Number.isFinite(durationMinutes)
        ? Math.min(Math.max(durationMinutes, MIN_DURATION), MAX_DURATION)
        : durationMinutes;

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

/** `JSON.stringify(NaN)` is the string "null"; a number should say what it is. */
const describeValue = (value) =>
    typeof value === 'number' ? String(value) : JSON.stringify(value);

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
 *
 * That division of labour makes this guard deliberately narrower than "a legal
 * booking": grid alignment is nobody's business here either, so `37.5` passes.
 * The fold only refuses what would corrupt its own arithmetic. Nothing in this
 * file snaps to `SLOT_MINUTES` — that happens upstream of the gestures, in
 * `lib/scheduleGeometry`, where a pointer position becomes minutes — and the
 * server rejects anything that still arrives off-grid.
 */
const assertSchedulable = (item) => {
    if (!Number.isFinite(item.startMinutes) || !Number.isFinite(item.durationMinutes)) {
        throw new Error(
            `Item ${item.todoId} needs a number for both startMinutes and ` +
                `durationMinutes, got ${describeValue(item.startMinutes)} ` +
                `and ${describeValue(item.durationMinutes)}`
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

/**
 * Splits a settled day into what stays and what has been pushed past midnight.
 *
 * The overflow is always a contiguous tail, which is why a single index is
 * enough: the list is ordered and non-overlapping, so if one item ends past
 * 24:00 then every item after it starts past 24:00 too.
 */
const partitionOverflow = (settled) => {
    const index = settled.findIndex((item) => endOf(item) > DAY_MINUTES);

    if (index === -1) return { keep: settled, overflow: [] };

    return { keep: settled.slice(0, index), overflow: settled.slice(index) };
};

/**
 * Slides a group so its first item starts at 00:00, preserving the spacing
 * between its members.
 *
 * A spilled group is contiguous whenever every start handed to the fold sat
 * inside the day: the first overflowing item ends past 24:00, so the cursor is
 * already beyond any later item's own start and each one is pushed flush against
 * the one above. A start past 24:00 — which the fold permits and no gesture
 * produces — is not raised, and its gap survives: `1300/200` and `1600/60` spill
 * to `0/200` and `300/60`, still a legal day. Shifting the whole group is what
 * makes that degrade gracefully, and it does not depend on the caller having
 * settled first.
 */
const rebaseToTop = (group) => {
    const offset = group[0].startMinutes;

    return group.map((item) => ({ ...item, startMinutes: item.startMinutes - offset }));
};

/**
 * A day that does not exist on the server yet. Negative id, like every other
 * optimistic row in this app; `createdAt` is stamped now so the column header
 * has something to show before the save lands.
 */
const newDay = (position) => ({
    id: createTempId(),
    position,
    createdAt: new Date().toISOString(),
});

/**
 * A booking longer than a day spills forever: rebased to 00:00 it still ends
 * past midnight, so every pass moves it on and appends another day. The fold
 * does not care — `settleDay` settles a 2000-minute item correctly — so this is
 * the spill's precondition, not the fold's, and it is checked here.
 */
const assertFitsInADay = (item) => {
    if (item.durationMinutes > MAX_DURATION) {
        throw new Error(
            `Item ${item.todoId} has a duration of ${item.durationMinutes}; ` +
                `it must be at most ${MAX_DURATION}`
        );
    }
};

/**
 * Settles one day and carries whatever no longer fits into the next, over and
 * over until everything has a home — appending days when it runs out.
 *
 * An item is never split across a midnight boundary. It moves whole, which is
 * why the overflow group arrives at the top of the next day and pushes that
 * day's contents down rather than weaving into them.
 *
 * This terminates. Every pass but the first places at least one item for good:
 * the first overflowing item is rebased to 00:00 and sorts to the top of the
 * receiving day, so it settles at 00:00 there and ends at its own duration,
 * which `assertFitsInADay` holds to a day. The first pass can place nothing —
 * the caller's anchor is wherever the gesture put it, not rebased — so the bound
 * is one pass per item plus one, and the loop states it. Left unstated, a change
 * that breaks the proof would hang the tab on a pointer move instead of failing
 * where someone can see it.
 *
 * Returns a new `{ days, items }`; the input is untouched. Pure but for one
 * thing: an appended day stamps `createdAt` from the clock. Nothing in the
 * client reads that field — no component, no test, no sort, since day order is
 * `position` then `id` on both sides — and the server overwrites it on
 * reconcile, so threading a `now` through four gestures to reach a field nobody
 * consumes would buy nothing. The first thing that asserts on, sorts by, or
 * renders `createdAt` makes that false and turns it into a parameter.
 */
export const spillFrom = (state, dayId, anchorTodoIds = []) => {
    let days = state.days;
    let items = state.items;
    let index = days.findIndex((day) => day.id === dayId);
    let anchors = [].concat(anchorTodoIds);

    if (index === -1) throw new Error(`No day with id ${dayId} to settle`);

    for (let pass = 0; pass <= state.items.length; pass += 1) {
        const day = days[index];
        const onThisDay = items.filter((item) => item.dayId === day.id);

        onThisDay.forEach(assertFitsInADay);

        const settled = settleDay(onThisDay, anchors);
        const { keep, overflow } = partitionOverflow(settled);

        items = [...items.filter((item) => item.dayId !== day.id), ...keep];

        if (overflow.length === 0) return { ...state, days, items };

        if (index === days.length - 1) days = [...days, newDay(days.length)];

        const next = days[index + 1];
        const moved = rebaseToTop(overflow).map((item) => ({ ...item, dayId: next.id }));

        items = [...items, ...moved];
        anchors = moved.map((item) => item.todoId);
        index += 1;
    }

    throw new Error(
        'spillFrom exceeded one pass per item; the placement rule no longer settles'
    );
};

// The four gestures the page calls, and the one query they need. Everything
// above is the arithmetic they run on; this is the API the calendar reaches for.
//
// They run on every pointer move, and the arithmetic below them asserts:
// `settleDay` refuses an item without a real start and length, `spillFrom` one
// longer than a day. A React error boundary will not catch either — boundaries
// do not catch what an event handler throws — so a throw in a `pointermove`
// reaches `window.onerror` with the tree still mounted, and the drag stops dead
// with nothing on screen saying why. A `try`/`catch` per gesture would be worse
// still: a programmer error swallowed on every frame of a drag.
//
// So the gestures narrow what can reach the assertions instead of catching them.
// `durationMinutes` is the one field with bounds a gesture can enforce — a start
// has none, because running off the end of a day is exactly what the spill is
// for — so it is bounded here, and no gesture introduces a booking longer than
// a day.
//
// Everything else is an invariant rather than a bound: every item in the state
// tree carries a finite start and a length that fits in a day. Like the
// `todoId` case below, neither has a sensible per-frame repair, so both are
// checked once, at ingest, instead. `assertIngestible` below is what
// establishes it. `calendarReducer` calls it at the two points where data
// enters the state tree — the serialized server response on load, and a
// gesture's settled result on commit, which covers both an optimistic row and
// the real thing landing after a save (a pool drag's live preview runs this
// arithmetic first, guarded separately, and reaches this check only at the
// drop). A rollback restores a snapshot that was already checked on its way
// in, so it needs no second check there.
//
// Nothing today establishes that a `todoId` arriving from a drag payload is the
// same type as the ones already in state (see `placeFromPool`) — that has no
// sensible per-frame repair either, but is not one of `spillFrom`'s
// preconditions, so it stays open rather than folded into this guard.
//
// Because the reducer checks on the way in, these assertions can now only fire
// on a state that was already broken before any pointer moved.

/**
 * Both of `spillFrom`'s preconditions, composed: a real start and a positive
 * length, and a length that fits in a day. Not a third definition of "a legal
 * item" — `calendarReducer` calls this rather than either guard alone because
 * both have to hold for anything ingested, not just whichever one the fold
 * happens to reach first.
 */
export const assertIngestible = (item) => {
    assertSchedulable(item);
    assertFitsInADay(item);
};

/**
 * The booking for a to-do, or a throw when there is none — a gesture aimed at
 * something unbooked is a wiring mistake in the caller, not a state to quietly
 * produce no change for, which would look like a drag that silently did nothing.
 */
const requireBooking = (state, todoId) => {
    const booking = state.items.find((item) => item.todoId === todoId);

    if (!booking) throw new Error(`To-do ${todoId} is not booked`);

    return booking;
};

/**
 * Books a to-do dragged out of the pool. Everything beyond the four scheduling
 * fields — text, status, project and sequence — is carried through untouched, so
 * the new card can draw itself before the save lands.
 *
 * A to-do already booked is refused rather than moved. Moving is `moveItem`, and
 * a second booking is impossible by design (decision 4) — the pool makes a
 * scheduled row inert precisely so this cannot be reached.
 *
 * That refusal matches on identity, so a `todoId` of the wrong type slips past
 * it: `'7'` does not equal a stored `7`, and this books a second row for a to-do
 * that already has one, then hands the string on to the server. `settleDay`
 * carries the same warning about anchors, but a mis-typed anchor only mis-orders
 * a day, where this fails silently and persists. Ids arriving from a drag
 * library or a `dataset` attribute are strings; normalising them belongs at that
 * boundary, with the ingestion check above.
 *
 * The duration is bounded because this is where one is decided: the default
 * covers the ordinary drop, and a caller that overrides it has no geometry step
 * in front of it to have bounded first.
 */
export const placeFromPool = (
    state,
    { todoId, dayId, startMinutes, durationMinutes = DEFAULT_DURATION, ...display }
) => {
    if (state.items.some((item) => item.todoId === todoId)) {
        throw new Error(`To-do ${todoId} is already booked`);
    }

    const booking = {
        ...display,
        todoId,
        dayId,
        startMinutes,
        durationMinutes: boundDuration(durationMinutes),
    };

    return spillFrom({ ...state, items: [...state.items, booking] }, dayId, [todoId]);
};

/**
 * Moves a booking, within its day or to another one.
 *
 * Only the destination day is settled. The source keeps the gap the departure
 * leaves, which is the same asymmetry a shrink has: positions are what they are
 * drawn as, and nothing rearranges itself behind the user's back (decision 7).
 */
export const moveItem = (state, { todoId, dayId, startMinutes }) => {
    requireBooking(state, todoId);

    const items = state.items.map((item) =>
        item.todoId === todoId ? { ...item, dayId, startMinutes } : item
    );

    return spillFrom({ ...state, items }, dayId, [todoId]);
};

/**
 * Resizes a booking. Both edges arrive here as one rectangle — which edge was
 * dragged, and where the top edge may stop, is the caller's business
 * (`lib/scheduleGeometry` and `topEdgeFloor` below).
 *
 * The duration is bounded again here even though the geometry already clamped it
 * to draw the ghost. That is not distrust of the caller so much as what the two
 * answer to: the geometry's clamp serves the rectangle on screen, and this bound
 * is the last thing between a pointer and the state tree.
 */
export const resizeItem = (state, { todoId, startMinutes, durationMinutes }) => {
    const existing = requireBooking(state, todoId);
    const bounded = boundDuration(durationMinutes);

    const items = state.items.map((item) =>
        item.todoId === todoId ? { ...item, startMinutes, durationMinutes: bounded } : item
    );

    return spillFrom({ ...state, items }, existing.dayId, [todoId]);
};

/**
 * Releases a booking — the drop on the pool's remove overlay. Nothing is
 * settled: the day keeps the gap, for the same reason a move does.
 */
export const unscheduleItem = (state, todoId) => {
    requireBooking(state, todoId);

    return { ...state, items: state.items.filter((item) => item.todoId !== todoId) };
};

/**
 * The earliest a top-edge drag may pull a booking's start: the end of the item
 * above it, or midnight when it is the first of its day.
 *
 * The top edge clamps rather than pushes, because the cascade only ever runs
 * downward. Letting it push upward would be a second, opposite rule for one
 * gesture, and would make the item above move when the user was dragging the one
 * below.
 */
export const topEdgeFloor = (state, todoId) => {
    const booking = requireBooking(state, todoId);

    const above = state.items
        .filter(
            (other) =>
                other.dayId === booking.dayId &&
                other.todoId !== todoId &&
                other.startMinutes < booking.startMinutes
        )
        .sort((a, b) => a.startMinutes - b.startMinutes);

    return above.length === 0 ? 0 : endOf(above[above.length - 1]);
};

/**
 * Adds a day to the end of the strip — the + at its right-hand edge.
 *
 * The day is unsaved, like one the spill creates: it is drawn under a negative
 * id and re-keyed when the server answers. The two paths produce the same shape
 * on purpose, so nothing downstream has to know which made it.
 */
export const appendDay = (state) => ({
    ...state,
    days: [...state.days, newDay(state.days.length)],
});

/**
 * Deletes a day and releases the bookings in it.
 *
 * The to-dos themselves are untouched — this returns them to the pool, the way
 * deleting a sequence returns its to-dos to the unorganized panel (decision 6).
 * Positions close up behind it so they stay dense, matching what the server does
 * to the same ordering.
 */
export const removeDay = (state, dayId) => {
    if (!state.days.some((day) => day.id === dayId)) {
        throw new Error(`No day with id ${dayId} to remove`);
    }

    return {
        ...state,
        days: state.days
            .filter((day) => day.id !== dayId)
            .map((day, position) => (day.position === position ? day : { ...day, position })),
        items: state.items.filter((item) => item.dayId !== dayId),
    };
};
