'use strict';

const crypto = require('node:crypto');

const { firstRow } = require('./sql');

/**
 * Data access for `device_tokens`: revocable per-device credentials. Only the
 * sha256 of a token is stored, so the token itself is returned once, from `create`.
 */

const TOKEN_BYTES = 32;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const create = async (conn, { ownerId, name }) => {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const [result] = await conn.execute('INSERT INTO device_tokens (owner_id, name, token_hash) VALUES (?, ?, ?)', [
        ownerId,
        name,
        hashToken(token),
    ]);
    const [rows] = await conn.execute('SELECT id, name, created_at FROM device_tokens WHERE id = ?', [result.insertId]);

    return { ...rows[0], token };
};

const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute('SELECT id, name, last_used_at, created_at FROM device_tokens WHERE owner_id = ? ORDER BY id', [
        ownerId,
    ]);

    return rows;
};

const removeForOwner = async (conn, ownerId, id) => {
    const [result] = await conn.execute('DELETE FROM device_tokens WHERE owner_id = ? AND id = ?', [ownerId, id]);

    return result.affectedRows > 0;
};

const findByToken = async (conn, token) => {
    const [rows] = await conn.execute('SELECT id, owner_id FROM device_tokens WHERE token_hash = ?', [hashToken(token)]);

    return firstRow(rows);
};

const touch = async (conn, id) => {
    await conn.execute('UPDATE device_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?', [id]);
};

module.exports = { create, listByOwner, removeForOwner, findByToken, touch };
