'use strict';

/**
 * Database rows out, API payloads in — one place that decides what the client
 * sees. Columns like `owner_id` stay server-side, and snake_case becomes
 * camelCase at the boundary rather than leaking through the whole frontend.
 */

/**
 * `todo_count` and `completed_todo_count` come from the aggregate queries in
 * `projectsRepo`; MySQL returns SUM() as a string, so both are coerced here.
 * A row selected without them counts as zero.
 */
const toProject = (row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    todoCount: Number(row.todo_count ?? 0),
    completedTodoCount: Number(row.completed_todo_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const toLayer = (row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

/**
 * `is_blocked` and `is_collapsed` are tinyints, so they arrive as 0 or 1. Both
 * become real booleans here — the client tests `isBlocked` directly in
 * `sequenceStatus`, and `0` being falsy is not something to rely on across a
 * JSON boundary.
 */
const toSequence = (row) => ({
    id: row.id,
    projectId: row.project_id,
    layerId: row.layer_id,
    title: row.title,
    description: row.description ?? null,
    isBlocked: Boolean(row.is_blocked),
    isCollapsed: Boolean(row.is_collapsed),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

/**
 * `sequenceId: null` is the unorganized panel, not a missing value. `completedAt`
 * is null for anything not complete, and is the moment of the tick rather than
 * of the last edit — the DONE group on a sequence card dates its rows from it.
 */
const toTodo = (row) => ({
    id: row.id,
    projectId: row.project_id,
    sequenceId: row.sequence_id ?? null,
    text: row.text,
    status: row.status,
    completedAt: row.completed_at ?? null,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const toEdge = (row) => ({
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    childId: row.child_id,
    createdAt: row.created_at,
});

/**
 * One line of the ready frontier on the projects home page (spec section 4.8):
 * a sequence the caller can start now, and the to-do to pick up in it.
 *
 * Deliberately narrow. The home page lists a name and a next step; sending whole
 * sequence and to-do objects for every project would put most of every graph on
 * the wire to render two lines of text.
 *
 * `nextTodo` is null for two quite different reasons, and the card has to say
 * different things about them: the sequence holds no to-dos at all, or it holds
 * outstanding ones and every one of them is blocked — `readyFrontier` skips a
 * blocked to-do the way it skips a complete one (spec section 3). `isStalled` is
 * the second of those: ready, but with nothing in it that can be picked up.
 * `todos` is the project's to-dos, the same array the frontier was derived from.
 */
const toFrontierEntry = ({ sequence, nextTodo }, todos) => ({
    sequenceId: sequence.id,
    sequenceTitle: sequence.title,
    nextTodo: nextTodo ? { id: nextTodo.id, text: nextTodo.text } : null,
    isStalled: !nextTodo && todos.some((todo) => todo.sequenceId === sequence.id),
});

module.exports = { toEdge, toFrontierEntry, toLayer, toProject, toSequence, toTodo };
