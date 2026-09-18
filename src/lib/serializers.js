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
    isPinned: Boolean(row.is_pinned),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

/** One pinned to-do in the deliberately narrow pinned-list wire shape. */
const toPinnedTodo = (row) => ({
    id: row.id,
    text: row.text,
    status: row.status,
    sequenceId: row.sequence_id ?? null,
    sequenceTitle: row.sequence_title ?? null,
    position: row.position,
    isPinned: Boolean(row.is_pinned),
});

/**
 * A day carries no title: it is identified by where it sits and when it was
 * made. `owner_id` stays server-side like every other ownership column.
 */
const toCalendarDay = (row) => ({
    id: row.id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

/**
 * One booking, with the display data the day column needs folded in.
 *
 * A day column has to draw a name, tick a bubble and link to a project and a
 * sequence, and it cannot get those from the right-hand pool: a to-do leaves the
 * pool the moment it is completed, which is precisely when its card is specified
 * to stay on screen. An item that could not name itself after being ticked would
 * go blank as a result of the user finishing it.
 *
 * `sequenceId` is null when the to-do has since been returned to the unorganized
 * panel — `todos.sequence_id` is nullable, and nothing stops a to-do being
 * unfiled on the project page after it was booked here. The row still comes
 * back; the query reaches `sequences` through a LEFT JOIN for that reason.
 *
 * Times are integer minutes from midnight, never clock strings. Formatting is
 * the client's business.
 */
const toCalendarItem = (row) => ({
    id: row.id,
    dayId: row.day_id,
    todoId: row.todo_id,
    text: row.text,
    status: row.status,
    isPinned: Boolean(row.is_pinned),
    projectId: row.project_id,
    projectTitle: row.project_title,
    sequenceId: row.sequence_id ?? null,
    sequenceTitle: row.sequence_title ?? null,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
});

/**
 * One note on its way to the browser.
 *
 * Narrower than `toCalendarItem`, which has to carry a project and a sequence so
 * a booking can draw itself after leaving the pool. A note belongs to nothing
 * but its day and carries its own text, so there is nothing to join and nothing
 * to pass through.
 *
 * No timestamps: nothing in the UI shows when a note was written. No lane
 * either — that is derived in the browser from the day's notes (decision 5).
 *
 * Times are integer minutes from midnight, never clock strings, matching every
 * other calendar serializer.
 */
const toCalendarNote = (row) => ({
    id: row.id,
    dayId: row.day_id,
    text: row.text,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
});

module.exports = {
    toCalendarDay,
    toCalendarItem,
    toCalendarNote,
    toLayer,
    toPinnedTodo,
    toProject,
    toSequence,
    toTodo,
};
