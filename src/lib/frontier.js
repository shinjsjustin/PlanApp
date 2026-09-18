'use strict';

/**
 * The ready frontier, server-side (spec section 4.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MIRROR OF `src/client/src/lib/graph.js`. Change one, change the other.
 *
 * The browser needs these derivations for the project page and the server needs
 * them for the projects home page, and the two runtimes do not share a module
 * system: `lib/graph.js` is ES-module source compiled by Create React App, this
 * is CommonJS run by Node. Importing across that line would mean either a build
 * step for the server or a second module format for the client — more machinery
 * than 60 lines of arithmetic is worth.
 *
 * What keeps the twins honest instead is `src/shared/frontierFixtures.json`:
 * one table of cases, read by `tests/unit/frontier.test.js` here and by
 * `src/client/src/lib/graph.frontier.test.js` there. A change to one derivation
 * that the other does not follow turns one of those suites red.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything here is a pure function of plain data in the API's camelCase wire
 * shape — the output of `src/lib/serializers.js`, which is exactly what the
 * client consumes. Nothing is mutated; callers keep their arrays.
 */

const SEQUENCE_STATUS = {
    blocked: 'blocked',
    complete: 'complete',
    incomplete: 'incomplete',
};

const TODO_STATUS = {
    blocked: 'blocked',
    complete: 'complete',
    incomplete: 'incomplete',
};

const byPosition = (a, b) => a.position - b.position;

const todosOf = (sequence, todos) => todos.filter((todo) => todo.sequenceId === sequence.id);

/**
 * `blocked` is the manual override and wins over everything. Otherwise a
 * sequence is complete only once it holds to-dos and every one of them is
 * complete — an empty sequence is incomplete, not finished.
 *
 * `todos` may be the whole project's to-dos; those belonging to other sequences,
 * and the unorganized ones, are filtered out here.
 */
const sequenceStatus = (sequence, todos) => {
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
const nextTodoOf = (sequence, todos) => {
    const open = todosOf(sequence, todos).filter(
        (todo) => todo.status === TODO_STATUS.incomplete
    );

    if (open.length === 0) return null;

    return [...open].sort(byPosition)[0];
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
 */
const readyFrontier = ({ layers, sequences, todos }) => {
    const statusById = new Map(
        sequences.map((sequence) => [sequence.id, sequenceStatus(sequence, todos)])
    );

    const frontierOf = (layer) => {
        const own = sequences.filter((sequence) => sequence.layerId === layer.id);

        const first = [...own]
            .sort(byPosition)
            .find((sequence) => statusById.get(sequence.id) !== SEQUENCE_STATUS.complete);

        if (!first) return null;
        if (statusById.get(first.id) !== SEQUENCE_STATUS.incomplete) return null;

        return { sequence: first, nextTodo: nextTodoOf(first, todos) };
    };

    return [...layers]
        .sort(byPosition)
        .map(frontierOf)
        .filter((entry) => entry !== null);
};

module.exports = { SEQUENCE_STATUS, TODO_STATUS, readyFrontier, sequenceStatus };
