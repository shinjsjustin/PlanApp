// The derived values the whole app agrees on (spec section 4.3).
//
// Everything here is a pure function of plain data — no React, no fetch, no
// state. A sequence's status is never stored, so it cannot go stale when a
// to-do is ticked off; it is recomputed from the to-dos every render.
//
// ─────────────────────────────────────────────────────────────────────────────
// `sequenceStatus` and `readyFrontier` are MIRRORED SERVER-SIDE in
// `src/lib/frontier.js`, which the projects home page uses to compute every
// project's frontier in one batched pass. Change one, change the other.
//
// They are copies rather than one shared module because this file is ES-module
// source compiled by Create React App and that one is CommonJS run by Node;
// bridging that would cost a build step for the server or a second module
// format for the client, which is more machinery than the arithmetic is worth.
//
// What keeps them honest is `src/shared/frontierFixtures.json`: one table of
// cases read by `graph.frontier.test.js` here and `tests/unit/frontier.test.js`
// there, so a change to one derivation that the other does not follow goes red.
// ─────────────────────────────────────────────────────────────────────────────

export const SEQUENCE_STATUS = {
    blocked: 'blocked',
    complete: 'complete',
    incomplete: 'incomplete',
};

export const TODO_STATUS = {
    blocked: 'blocked',
    complete: 'complete',
    incomplete: 'incomplete',
};

/** A new array ordered by `position`. The input is never touched. */
export const sortByPosition = (items) => [...items].sort((a, b) => a.position - b.position);

const todosOf = (sequence, todos) => todos.filter((todo) => todo.sequenceId === sequence.id);

/**
 * `blocked` is the manual override and wins over everything. Otherwise a
 * sequence is complete only once it holds to-dos and every one of them is
 * complete — an empty sequence is incomplete, not finished.
 *
 * `todos` may be the whole project's to-dos; those belonging to other sequences,
 * and the unorganized ones, are filtered out here so callers need not group
 * them first.
 */
export const sequenceStatus = (sequence, todos) => {
    if (sequence.isBlocked) return SEQUENCE_STATUS.blocked;

    const own = todosOf(sequence, todos);

    if (own.length === 0) return SEQUENCE_STATUS.incomplete;

    return own.every((todo) => todo.status === TODO_STATUS.complete)
        ? SEQUENCE_STATUS.complete
        : SEQUENCE_STATUS.incomplete;
};

/**
 * The first to-do that can actually be picked up, by position, or null when
 * there is none.
 *
 * Blocked is skipped along with complete. This answers "what do I do next", and
 * a to-do waiting on something outside the plan is no more an answer than a
 * finished one — a sequence whose every outstanding item is blocked has nothing
 * to offer and says so with a null.
 */
export const nextTodoOf = (sequence, todos) =>
    sortByPosition(todosOf(sequence, todos)).find(
        (todo) => todo.status === TODO_STATUS.incomplete
    ) ?? null;

/**
 * How much of a sequence is finished — the numbers every count on a card is
 * written from: "1/4" collapsed, "2 LEFT" in the header badge, "3 to-dos" on one
 * not started, "3/3 complete" on one that is done.
 *
 * Derived like everything else here, so a ticked to-do moves all four at once.
 */
export const todoCountsOf = (sequence, todos) => {
    const own = todosOf(sequence, todos);
    const done = own.filter((todo) => todo.status === TODO_STATUS.complete).length;

    return { done, total: own.length, remaining: own.length - done };
};

/**
 * "What can I actually work on right now?" — one line per layer, top to bottom,
 * each pairing the layer's first unfinished sequence with the next to-do to pick
 * up in it.
 *
 * A layer is worked left to right, so its frontier sequence is the first one by
 * position that is not complete. That sequence is offered only when it is
 * incomplete: if it is blocked by hand the layer contributes nothing, and the
 * search does not carry on past it — "not this, not yet" means the layer waits,
 * not that the next card takes its turn.
 *
 * Layers are independent. Nothing in one layer gates another, so an unfinished
 * or blocked layer never holds back the ones below it.
 *
 * An empty frontier means one of three things: a project with no sequences at
 * all, one whose every sequence is complete, and one whose every layer leads
 * with a blocked sequence. All three collapse to the same `[]` here; telling
 * them apart is the caller's job, not this function's.
 *
 * Takes the project's layers, sequences and to-dos as plain arrays; neither
 * input needs to arrive sorted, and neither is touched.
 */
export const readyFrontier = ({ layers, sequences, todos }) => {
    const statusById = new Map(
        sequences.map((sequence) => [sequence.id, sequenceStatus(sequence, todos)])
    );

    const frontierOf = (layer) => {
        const own = sequences.filter((sequence) => sequence.layerId === layer.id);

        const first = sortByPosition(own).find(
            (sequence) => statusById.get(sequence.id) !== SEQUENCE_STATUS.complete
        );

        if (!first) return null;
        if (statusById.get(first.id) !== SEQUENCE_STATUS.incomplete) return null;

        return { sequence: first, nextTodo: nextTodoOf(first, todos) };
    };

    return sortByPosition(layers)
        .map(frontierOf)
        .filter((entry) => entry !== null);
};

/**
 * The one sequence "in operation" — the single card on the canvas that carries
 * the spotlight (the purple ring collapsed, the NEXT STEP band open). Null when
 * there is nothing to work on.
 *
 * The rule is derived rather than stored, and it is the ready frontier narrowed
 * to one: of the frontier sequences — one per layer, topmost layer first — take
 * the first that actually holds something to pick up. That is the same "what can
 * I work on right now" question the projects home page asks, answered down to a
 * single card, which is what makes the ring exclusive: a canvas has one focal
 * point or none, never several.
 *
 * Blocked sequences need no filtering here: `readyFrontier` already leaves a
 * blocked layer out entirely, so a card sitting behind a block never takes its
 * turn at the ring either. `layers` decides the ordering and `readyFrontier`
 * sorts it; a sequence whose layer is not in the list belongs to no layer and is
 * passed over rather than throwing.
 */
export const activeSequenceId = ({ layers, sequences, todos }) => {
    const startable = readyFrontier({ layers, sequences, todos }).find(
        ({ nextTodo }) => nextTodo !== null
    );

    return startable ? startable.sequence.id : null;
};
