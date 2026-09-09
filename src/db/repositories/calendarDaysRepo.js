'use strict';

const { firstRow, applyPositions } = require('./sql');
const { insertAt, removeItem } = require('./positions');

/**
 * Data access for `calendar_days` — the ordered 24-hour containers of the
 * calendar page, left to right by a dense `position`.
 *
 * Unlike every other positioned table here, the ordering is scoped to a *user*
 * rather than to a parent row: the calendar draws from all of an owner's
 * projects, so it hangs off `users` directly. Everything below therefore reads
 * and reindexes by `owner_id`.
 *
 * A day carries no title. It is identified by where it sits and when it was
 * made, which is what `position` and `created_at` are for; naming days is
 * deliberately out of scope for the first pass (design section 11).
 */

const TABLE = 'calendar_days';

const SELECT_COLUMNS = 'id, owner_id, position, created_at, updated_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM calendar_days WHERE id = ?`,
        [id]
    );

    return firstRow(rows);
};

const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM calendar_days
         WHERE owner_id = ?
         ORDER BY position, id`,
        [ownerId]
    );

    return rows;
};

/** The owner's day ids in display order — the input to the position helpers. */
const listIds = async (conn, ownerId) => {
    const days = await listByOwner(conn, ownerId);

    return days.map((day) => day.id);
};

/**
 * Appends a day at the end of the owner's strip. There is no "insert before"
 * form: days are only ever added at the end, by the + at the right of the strip
 * or by an overflow that ran out of room (design section 6).
 */
const create = async (conn, { ownerId }) => {
    const ordering = await listIds(conn, ownerId);

    // Insert at the end first and let the reindex place it, so the new row can
    // never collide with an existing position.
    const [result] = await conn.execute(
        'INSERT INTO calendar_days (owner_id, position) VALUES (?, ?)',
        [ownerId, ordering.length]
    );

    await applyPositions(conn, TABLE, insertAt(ordering, result.insertId, ordering.length));

    return findById(conn, result.insertId);
};

/**
 * Deletes a day and closes the gap it leaves. Its bookings go with it through
 * the schema's `ON DELETE CASCADE`, and the to-dos behind them are untouched —
 * the container goes, the work does not (design decision 6).
 *
 * Rewrites more than one row, so callers run it inside a transaction.
 */
const remove = async (conn, id) => {
    const existing = await findById(conn, id);
    if (!existing) return false;

    const ordering = await listIds(conn, existing.owner_id);

    await conn.execute('DELETE FROM calendar_days WHERE id = ?', [id]);
    await applyPositions(conn, TABLE, removeItem(ordering, id));

    return true;
};

module.exports = { create, findById, listByOwner, listIds, remove };
