'use strict';

/**
 * Data access for `google_exports` — maps a booked item key ('todo:<id>' or
 * 'sequence:<id>') to the Google event it was exported as.
 */

const listByUser = async (conn, userId) => {
    const [rows] = await conn.execute(
        'SELECT item_key, google_event_id FROM google_exports WHERE user_id = ? ORDER BY item_key',
        [userId]
    );

    return rows.map((row) => ({ itemKey: row.item_key, googleEventId: row.google_event_id }));
};

const upsert = async (conn, { userId, itemKey, googleEventId }) => {
    await conn.execute(
        `INSERT INTO google_exports (user_id, item_key, google_event_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE google_event_id = VALUES(google_event_id)`,
        [userId, itemKey, googleEventId]
    );
};

const remove = async (conn, userId, itemKey) => {
    await conn.execute('DELETE FROM google_exports WHERE user_id = ? AND item_key = ?', [
        userId,
        itemKey,
    ]);
};

module.exports = { listByUser, remove, upsert };
