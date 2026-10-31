'use strict';

/**
 * Data access for `lived_moments`. Moments are written a whole day at a time,
 * and every query is scoped to the owner so one user never sees another's day.
 */

const SELECT_SQL = `SELECT id, owner_id, DATE_FORMAT(lived_on, '%Y-%m-%d') AS lived_on, start_minutes,
        duration_minutes, title, category, detail, chat_ticks, created_at, updated_at
     FROM lived_moments`;

const MOMENT_PLACEHOLDERS = '(?, ?, ?, ?, ?, ?, ?, ?)';

// mysql2 parses JSON columns by default, but not on every connection config.
const withChatTicksArray = (row) => ({
    ...row,
    chat_ticks: typeof row.chat_ticks === 'string' ? JSON.parse(row.chat_ticks) : row.chat_ticks,
});

const listRange = async (conn, ownerId, from, to) => {
    const [rows] = await conn.execute(
        `${SELECT_SQL} WHERE owner_id = ? AND lived_on BETWEEN ? AND ? ORDER BY lived_on, start_minutes, id`,
        [ownerId, from, to]
    );

    return rows.map(withChatTicksArray);
};

/** Deletes the owner's moments for the date and returns how many were removed. */
const clearDay = async (conn, ownerId, date) => {
    const [result] = await conn.execute('DELETE FROM lived_moments WHERE owner_id = ? AND lived_on = ?', [
        ownerId,
        date,
    ]);

    return result.affectedRows;
};

/** Callers wrap this in a transaction so the delete and insert land together. */
const replaceDay = async (conn, ownerId, date, moments) => {
    await clearDay(conn, ownerId, date);
    if (moments.length === 0) return [];

    const values = moments.flatMap((m) => [
        ownerId,
        date,
        m.startMinutes,
        m.durationMinutes,
        m.title,
        m.category,
        m.detail ?? null,
        JSON.stringify(m.chatTicks),
    ]);
    await conn.execute(
        `INSERT INTO lived_moments (owner_id, lived_on, start_minutes, duration_minutes, title, category, detail, chat_ticks)
         VALUES ${moments.map(() => MOMENT_PLACEHOLDERS).join(', ')}`,
        values
    );

    return listRange(conn, ownerId, date, date);
};

module.exports = { clearDay, listRange, replaceDay };
