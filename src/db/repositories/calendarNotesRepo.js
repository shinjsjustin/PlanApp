'use strict';

const { firstRow, buildAssignments } = require('./sql');

/**
 * Data access for `calendar_notes` — unplanned context attached to a day
 * (design 2026-09-16, section 4).
 *
 * The simplest table in the calendar, and the absences are why. There is no
 * `position` to keep dense, because a note's display order is `start_minutes`
 * then `id` — a real quantity and a tie-break, not an index anyone maintains.
 * There is no unique key to honour, because a day may hold any number of notes.
 * And there are no joins, unlike `calendarItemsRepo`: a note carries its own
 * text and belongs to nothing but its day, so a row can already draw itself.
 *
 * Which lane a note occupies is not here either. It is derived on the client
 * from the day's notes (decision 5), so it is neither stored nor selected.
 *
 * Ownership: `listByOwner` scopes by joining out to `calendar_days`. Everything
 * else trusts its caller, the way `calendarItemsRepo` does — the route owes them
 * an id already cleared by `assertOwnership`.
 */

const SELECT_COLUMNS =
    'n.id, n.day_id, n.text, n.start_minutes, n.duration_minutes, n.created_at, n.updated_at';

/** The fields `update` will accept, and the column each one writes. */
const UPDATABLE_COLUMNS = {
    text: 'text',
    dayId: 'day_id',
    startMinutes: 'start_minutes',
    durationMinutes: 'duration_minutes',
};

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM calendar_notes n WHERE n.id = ?`,
        [id]
    );

    return firstRow(rows) ?? null;
};

/** Every note in the owner's calendar, days left to right, notes top to bottom. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS}
         FROM calendar_notes n
         JOIN calendar_days d ON d.id = n.day_id
         WHERE d.owner_id = ?
         ORDER BY d.position, n.start_minutes, n.id`,
        [ownerId]
    );

    return rows;
};

/**
 * One day's notes, in display order. This is what the lane check reads: the
 * server validates what is *now stored* rather than what was sent, because a day
 * holds notes the request never mentioned (design section 5.4).
 */
const listByDayId = async (conn, dayId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS}
         FROM calendar_notes n
         WHERE n.day_id = ?
         ORDER BY n.start_minutes, n.id`,
        [dayId]
    );

    return rows;
};

const create = async (conn, { dayId, text, startMinutes, durationMinutes }) => {
    const [result] = await conn.execute(
        `INSERT INTO calendar_notes (day_id, text, start_minutes, duration_minutes)
         VALUES (?, ?, ?, ?)`,
        [dayId, text, startMinutes, durationMinutes]
    );

    return findById(conn, result.insertId);
};

/**
 * Applies the named fields and leaves the rest alone. Returns the updated row,
 * or null when there was no such note.
 *
 * The column list is built by `buildAssignments` from a fixed allow-list rather
 * than from the caller's keys, so an unexpected field cannot reach the SQL and
 * identifiers are quoted rather than interpolated raw. Values still go through
 * placeholders. `buildAssignments` throws when the patch names nothing to
 * change — an empty patch is a caller bug, not something to silently succeed
 * at, and the router rejects one before it ever reaches here.
 */
const update = async (conn, id, fields) => {
    const { clause, values } = buildAssignments(fields, UPDATABLE_COLUMNS);

    const existing = await findById(conn, id);
    if (!existing) return null;

    await conn.execute(`UPDATE calendar_notes SET ${clause} WHERE id = ?`, [...values, id]);

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM calendar_notes WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

module.exports = { create, findById, listByDayId, listByOwner, remove, update };
