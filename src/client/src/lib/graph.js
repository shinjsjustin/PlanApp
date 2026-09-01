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

/** The first to-do still to be done, by position, or null when there is none. */
export const nextTodoOf = (sequence, todos) =>
    sortByPosition(todosOf(sequence, todos)).find(
        (todo) => todo.status !== TODO_STATUS.complete
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
 * "What can I actually work on right now?" — the sequences that are not complete
 * and whose every parent is, each paired with the next to-do to pick up.
 *
 * A sequence with no parents qualifies as soon as it is incomplete. A project
 * whose every sequence is complete has an empty frontier.
 *
 * Takes the project's sequences, to-dos and edges as plain arrays.
 */
export const readyFrontier = ({ sequences, todos, edges }) => {
    const statusById = new Map(
        sequences.map((sequence) => [sequence.id, sequenceStatus(sequence, todos)])
    );

    const isComplete = (sequenceId) => statusById.get(sequenceId) === SEQUENCE_STATUS.complete;

    const parentsById = new Map(sequences.map((sequence) => [sequence.id, []]));
    edges.forEach((edge) => {
        parentsById.get(edge.childId)?.push(edge.parentId);
    });

    return sequences
        .filter((sequence) => {
            if (isComplete(sequence.id)) return false;

            return parentsById.get(sequence.id).every(isComplete);
        })
        .map((sequence) => ({ sequence, nextTodo: nextTodoOf(sequence, todos) }));
};

/**
 * The one sequence "in operation" — the single card on the canvas that carries
 * the spotlight (the purple ring collapsed, the NEXT STEP band open). Null when
 * there is nothing to work on.
 *
 * The rule is derived rather than stored, and it is the ready frontier narrowed
 * to one: of the sequences whose every parent is finished, take those that are
 * not blocked and actually hold something to pick up, and pick the earliest —
 * topmost layer first, then leftmost in that layer. That is the same "what can I
 * work on right now" question the projects home page asks, answered down to a
 * single card, which is what makes the ring exclusive: a canvas has one focal
 * point or none, never several.
 *
 * `layers` decides the ordering and is expected in position order already, as
 * `Canvas` keeps it; a sequence whose layer is missing sorts last rather than
 * throwing.
 */
export const activeSequenceId = ({ sequences, todos, edges, layers }) => {
    const layerPositionOf = (sequence) =>
        layers.find((layer) => layer.id === sequence.layerId)?.position ?? Infinity;

    const startable = readyFrontier({ sequences, todos, edges })
        .filter(({ sequence, nextTodo }) => nextTodo !== null && !sequence.isBlocked)
        .map(({ sequence }) => sequence);

    if (startable.length === 0) return null;

    const [first] = [...startable].sort(
        (a, b) =>
            layerPositionOf(a) - layerPositionOf(b) || a.position - b.position || a.id - b.id
    );

    return first.id;
};

/**
 * Whether an edge from `parent` to `child` is legal: same project, and strictly
 * downward in layer order. Strictly, so same-layer and upward edges are both
 * rejected — which is what makes the graph acyclic by construction. Skipping
 * layers downward is fine.
 *
 * Anything it cannot resolve — a missing sequence, a layer not in the list — is
 * a no, never a throw: this runs on every card during connect mode.
 */
export const canConnect = (parent, child, layers) => {
    if (!parent || !child) return false;
    if (parent.projectId !== child.projectId) return false;

    const positionOf = (sequence) =>
        layers.find((layer) => layer.id === sequence.layerId)?.position;

    const parentPosition = positionOf(parent);
    const childPosition = positionOf(child);

    if (parentPosition === undefined || childPosition === undefined) return false;

    return parentPosition < childPosition;
};

/**
 * Whether a sequence is a legal target for every currently selected parent —
 * what connect mode outlines (spec section 4.7).
 *
 * Every, not any: clicking the card connects it to all of them at once, so
 * offering a card that only some could reach would promise a connection the
 * click could not deliver. With two parents in different layers, the lower one
 * is what actually constrains the answer.
 *
 * An empty selection is false throughout. Nothing is selected, so the canvas is
 * not in connect mode and no card is a target.
 */
export const isEligibleChild = (sequence, parents, layers) =>
    parents.length > 0 && parents.every((parent) => canConnect(parent, sequence, layers));
