'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `thoughts` — throwaway notes that store only an owner, text
 * and creation time. A thought belongs directly to a user, so every method
 * scopes by `owner_id` or trusts an id the route has already checked.
 */

const SELECT_COLUMNS = 'id, owner_id, text, created_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM thoughts WHERE id = ?`,
        [id]
    );

    return firstRow(rows) ?? null;
};

/** Newest first; `id` breaks ties between thoughts created in the same second. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM thoughts
         WHERE owner_id = ?
         ORDER BY created_at DESC, id DESC`,
        [ownerId]
    );

    return rows;
};

const create = async (conn, { ownerId, text }) => {
    const [result] = await conn.execute(
        'INSERT INTO thoughts (owner_id, text) VALUES (?, ?)',
        [ownerId, text]
    );

    return findById(conn, result.insertId);
};

/** Changes the text and returns the row, or null when there was no such thought. */
const update = async (conn, id, { text }) => {
    const [result] = await conn.execute('UPDATE thoughts SET text = ? WHERE id = ?', [text, id]);
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM thoughts WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

/** Returns how many thoughts were removed. */
const removeAllByOwner = async (conn, ownerId) => {
    const [result] = await conn.execute('DELETE FROM thoughts WHERE owner_id = ?', [ownerId]);

    return result.affectedRows;
};

module.exports = { create, findById, listByOwner, remove, removeAllByOwner, update };
