// The derived values the whole app agrees on (spec section 4.3).
//
// Everything here is a pure function of plain data — no React, no fetch, no
// state. A sequence's status is never stored, so it cannot go stale when a
// to-do is ticked off; it is recomputed from the to-dos every render.
//
// The server no longer mirrors these helpers. This module is the client-owned
// source of truth for sequence lifecycle, pin activity and card counts.

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

/** The sequence's pinned to-dos in stored display order. */
export const pinnedTodosOf = (sequence, todos) =>
    sortByPosition(todosOf(sequence, todos).filter((todo) => todo.isPinned));

/** The earliest stored pin, regardless of lifecycle status. */
export const topPinnedTodoOf = (sequence, todos) => pinnedTodosOf(sequence, todos)[0] ?? null;

/** Every sequence containing at least one pin. Pin activity is not exclusive. */
export const activeSequenceIds = (sequences, todos) =>
    new Set(
        sequences
            .filter((sequence) =>
                todos.some((todo) => todo.sequenceId === sequence.id && todo.isPinned)
            )
            .map((sequence) => sequence.id)
    );

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
