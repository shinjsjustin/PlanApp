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
 * "What can I actually work on right now?" — the sequences that are incomplete
 * and whose every parent is complete, each paired with the next to-do to pick
 * up.
 *
 * Incomplete, not merely "not complete": a blocked sequence is held back by hand
 * and is not something to start, so it is left out along with the finished ones.
 *
 * A sequence with no parents qualifies as soon as it is incomplete. An empty
 * frontier means one of three things now: a project with no sequences at all,
 * one whose every sequence is complete, and one whose every otherwise-eligible
 * sequence is blocked. All three collapse to the same `[]` here; telling them
 * apart is the caller's job, not this function's.
 */
const readyFrontier = ({ sequences, todos, edges }) => {
    const statusById = new Map(
        sequences.map((sequence) => [sequence.id, sequenceStatus(sequence, todos)])
    );

    const isComplete = (sequenceId) => statusById.get(sequenceId) === SEQUENCE_STATUS.complete;

    const parentsById = new Map(sequences.map((sequence) => [sequence.id, []]));
    edges.forEach((edge) => {
        const parents = parentsById.get(edge.childId);
        if (parents) parents.push(edge.parentId);
    });

    return sequences
        .filter((sequence) => {
            // Incomplete is the only status with anything to start in it:
            // complete is finished, and blocked is the manual "not this, not
            // yet" that the whole frontier exists to respect.
            if (statusById.get(sequence.id) !== SEQUENCE_STATUS.incomplete) return false;

            return parentsById.get(sequence.id).every(isComplete);
        })
        .map((sequence) => ({ sequence, nextTodo: nextTodoOf(sequence, todos) }));
};

module.exports = { SEQUENCE_STATUS, TODO_STATUS, readyFrontier, sequenceStatus };
