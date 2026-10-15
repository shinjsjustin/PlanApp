'use strict';

const { firstRow, applyPositions } = require('./sql');
const { removeItem } = require('./positions');
const { addDays } = require('../../lib/localDate');

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

// Formatted in SQL so mysql2 never turns the date into a timezone-shifted Date.
const SELECT_COLUMNS =
    "id, owner_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, position, created_at, updated_at";

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

/** The owner's day count — the next dense position — and their latest date, if any. */
const countAndLastDate = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT COUNT(*) AS total, DATE_FORMAT(MAX(date), '%Y-%m-%d') AS last_date
         FROM calendar_days WHERE owner_id = ?`,
        [ownerId]
    );

    return firstRow(rows);
};

/**
 * Appends a day at the end of the owner's strip, dated the day after the last
 * one (or `today` when none is dated). There is no "insert before" form: days
 * are only ever added at the end, by the + at the right of the strip or by an
 * overflow that ran out of room (design section 6).
 *
 * Positions stay dense without a reindex here. The strip is 0..n-1 before the
 * insert, so n is free and appending at n leaves it 0..n. Nothing is ever
 * inserted mid-strip, and the bulk endpoint appends in a loop, where a reindex
 * per append would rewrite the whole strip each time.
 */
const create = async (conn, { ownerId, today }) => {
    const { total, last_date: lastDate } = await countAndLastDate(conn, ownerId);
    const date = lastDate ? addDays(lastDate, 1) : today ?? null;

    const [result] = await conn.execute(
        'INSERT INTO calendar_days (owner_id, position, date) VALUES (?, ?, ?)',
        [ownerId, total, date]
    );

    return findById(conn, result.insertId);
};

/**
 * Dates every dateless day, in position order, from the day after the last
 * dated one (or `today`). Days that already have a date are left alone.
 */
const assignMissingDates = async (conn, ownerId, today) => {
    const days = await listByOwner(conn, ownerId);
    const dated = days.filter((day) => day.date);
    let next = dated.length > 0 ? addDays(dated[dated.length - 1].date, 1) : today;

    for (const day of days.filter((candidate) => !candidate.date)) {
        await conn.execute('UPDATE calendar_days SET date = ? WHERE id = ?', [next, day.id]);
        next = addDays(next, 1);
    }
};

/** Deletes the owner's days dated before `today`, closes the gaps, returns the ids removed. */
const removeBefore = async (conn, ownerId, today) => {
    const [rows] = await conn.execute(
        'SELECT id FROM calendar_days WHERE owner_id = ? AND date < ?',
        [ownerId, today]
    );
    const removedIds = rows.map((row) => row.id);
    if (removedIds.length === 0) return removedIds;

    const ordering = await listIds(conn, ownerId);
    await conn.execute('DELETE FROM calendar_days WHERE owner_id = ? AND date < ?', [ownerId, today]);
    await applyPositions(
        conn,
        TABLE,
        ordering.filter((id) => !removedIds.includes(id))
    );

    return removedIds;
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

module.exports = {
    assignMissingDates,
    create,
    findById,
    listByOwner,
    listIds,
    remove,
    removeBefore,
};
