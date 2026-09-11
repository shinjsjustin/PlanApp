'use strict';

const { firstRow, applyPositions } = require('./sql');
const { removeItem } = require('./positions');

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

/** How many days the owner's strip holds — and so the next dense position. */
const countByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        'SELECT COUNT(*) AS total FROM calendar_days WHERE owner_id = ?',
        [ownerId]
    );

    return firstRow(rows).total;
};

/**
 * Appends a day at the end of the owner's strip. There is no "insert before"
 * form: days are only ever added at the end, by the + at the right of the strip
 * or by an overflow that ran out of room (design section 6).
 *
 * Positions stay dense without a reindex here. The strip is 0..n-1 before the
 * insert, so n is free and appending at n leaves it 0..n. Unlike `layersRepo`,
 * which this otherwise follows, nothing is ever inserted mid-strip, so there is
 * no ordering for an append to disturb — and the bulk endpoint appends in a
 * loop, where a reindex per append would rewrite the whole strip each time.
 */
const create = async (conn, { ownerId }) => {
    const position = await countByOwner(conn, ownerId);

    const [result] = await conn.execute(
        'INSERT INTO calendar_days (owner_id, position) VALUES (?, ?)',
        [ownerId, position]
    );

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
