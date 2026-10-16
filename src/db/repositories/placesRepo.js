'use strict';

const { firstRow, buildAssignments } = require('./sql');

/**
 * Data access for `places` — saved locations owned directly by a user. Methods
 * scope by `owner_id` or trust an id the route has already checked.
 */

const SELECT_COLUMNS =
    'id, owner_id, name, address, kind, notes, visit_minutes, is_default_start, created_at, updated_at';

const UPDATABLE_COLUMNS = {
    name: 'name',
    address: 'address',
    kind: 'kind',
    notes: 'notes',
    visitMinutes: 'visit_minutes',
};

const findById = async (conn, id) => {
    const [rows] = await conn.execute(`SELECT ${SELECT_COLUMNS} FROM places WHERE id = ?`, [id]);

    return firstRow(rows) ?? null;
};

/** By name; `id` breaks ties between places that share one. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM places WHERE owner_id = ? ORDER BY name, id`,
        [ownerId]
    );

    return rows;
};

const create = async (conn, { ownerId, name, address, kind = 'other', notes = null, visitMinutes = null }) => {
    const [result] = await conn.execute(
        `INSERT INTO places (owner_id, name, address, kind, notes, visit_minutes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ownerId, name, address, kind, notes, visitMinutes]
    );

    return findById(conn, result.insertId);
};

/** Changes the given fields and returns the row, or null when there was no such place. */
const update = async (conn, id, patch) => {
    const { clause, values } = buildAssignments(patch, UPDATABLE_COLUMNS);
    const [result] = await conn.execute(`UPDATE places SET ${clause} WHERE id = ?`, [...values, id]);
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM places WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

/**
 * Makes `id` the owner's only default start, or clears the default when `id` is
 * null. A single statement, so there is never a moment with two defaults. An id
 * belonging to another owner matches nothing and leaves the owner with no default.
 */
const setDefaultStart = async (conn, ownerId, id) => {
    await conn.execute(
        'UPDATE places SET is_default_start = (id <=> ?) WHERE owner_id = ?',
        [id ?? null, ownerId]
    );
};

module.exports = { create, findById, listByOwner, remove, setDefaultStart, update };
