'use strict';

/**
 * Data access for `calendar_items` — the bookings themselves.
 *
 * Reads here are wider than the table. A day column has to draw a name, tick a
 * bubble and link to a project and a sequence, and it cannot get those from the
 * right-hand pool: a to-do leaves the pool the moment it is completed, which is
 * exactly when its card stays on screen. So every read joins out to `todos`,
 * `projects` and `sequences` and hands the caller a row that can draw itself
 * (design section 5).
 *
 * `sequences` is reached through a LEFT JOIN because `todos.sequence_id` is
 * nullable: a to-do can be booked here and afterwards returned to the
 * unorganized panel on the project page. An INNER JOIN would make that booking
 * vanish from the calendar rather than merely lose its link.
 *
 * There is no `position` on a booking and so no reindexing: a day is ordered by
 * `start_minutes`, which is a real quantity rather than an index.
 */

const SELECT_COLUMNS = `ci.id, ci.day_id, ci.todo_id, ci.start_minutes, ci.duration_minutes,
            ci.created_at, ci.updated_at,
            t.text, t.status, t.project_id, t.sequence_id,
            p.title AS project_title, s.title AS sequence_title`;

const FROM_JOINS = `FROM calendar_items ci
         JOIN calendar_days d  ON d.id = ci.day_id
         JOIN todos t          ON t.id = ci.todo_id
         JOIN projects p       ON p.id = t.project_id
         LEFT JOIN sequences s ON s.id = t.sequence_id`;

/** Every booking in the owner's calendar, days left to right, items top to bottom. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS}
         ${FROM_JOINS}
         WHERE d.owner_id = ?
         ORDER BY d.position, ci.start_minutes, ci.id`,
        [ownerId]
    );

    return rows;
};

/**
 * The bookings in the named days. Used by the bulk endpoint to check the layout
 * it has just written, which must be read back rather than assumed: a day can
 * hold items the request never mentioned.
 */
const listByDayIds = async (conn, dayIds) => {
    if (dayIds.length === 0) return [];

    const placeholders = dayIds.map(() => '?').join(', ');

    // `query` rather than `execute`: the placeholder count varies per call.
    const [rows] = await conn.query(
        `SELECT ${SELECT_COLUMNS}
         ${FROM_JOINS}
         WHERE ci.day_id IN (${placeholders})
         ORDER BY ci.day_id, ci.start_minutes, ci.id`,
        dayIds
    );

    return rows;
};

/**
 * Books a to-do, or moves the booking it already has.
 *
 * One statement covers both because `uq_calendar_items_todo` makes them the same
 * operation: a to-do has at most one booking, so "book this" and "move this"
 * differ only in whether a row exists yet (design decision 4).
 */
const upsert = async (conn, { dayId, todoId, startMinutes, durationMinutes }) => {
    await conn.execute(
        `INSERT INTO calendar_items (day_id, todo_id, start_minutes, duration_minutes)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
             day_id = VALUES(day_id),
             start_minutes = VALUES(start_minutes),
             duration_minutes = VALUES(duration_minutes)`,
        [dayId, todoId, startMinutes, durationMinutes]
    );
};

/** Unschedules the named to-dos. Returns how many bookings were released. */
const removeByTodoIds = async (conn, todoIds) => {
    const unique = [...new Set(todoIds)];

    if (unique.length === 0) return 0;

    const placeholders = unique.map(() => '?').join(', ');

    const [result] = await conn.query(
        `DELETE FROM calendar_items WHERE todo_id IN (${placeholders})`,
        unique
    );

    return result.affectedRows;
};

module.exports = { listByDayIds, listByOwner, removeByTodoIds, upsert };
