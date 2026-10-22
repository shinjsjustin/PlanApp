'use strict';

const { firstRow } = require('./sql');

/** Data access for `push_subscriptions`: one row per browser endpoint, owned by one user. */

// The endpoint is unique, so re-subscribing from the same browser moves it to the current owner.
const save = async (conn, { ownerId, endpoint, p256dh, auth }) => {
    await conn.execute(
        `INSERT INTO push_subscriptions (owner_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
        [ownerId, endpoint, p256dh, auth]
    );
    const [rows] = await conn.execute('SELECT * FROM push_subscriptions WHERE endpoint = ?', [endpoint]);

    return firstRow(rows);
};

const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute('SELECT * FROM push_subscriptions WHERE owner_id = ? ORDER BY id', [ownerId]);

    return rows;
};

const countByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute('SELECT COUNT(*) AS total FROM push_subscriptions WHERE owner_id = ?', [ownerId]);

    return Number(rows[0].total);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM push_subscriptions WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

const removeForOwner = async (conn, ownerId, endpoint) => {
    const [result] = await conn.execute('DELETE FROM push_subscriptions WHERE owner_id = ? AND endpoint = ?', [ownerId, endpoint]);

    return result.affectedRows > 0;
};

const markSuccess = async (conn, id) => {
    await conn.execute('UPDATE push_subscriptions SET last_success_at = UTC_TIMESTAMP() WHERE id = ?', [id]);
};

module.exports = { save, listByOwner, countByOwner, remove, removeForOwner, markSuccess };
