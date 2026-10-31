'use strict';

const { firstRow, buildAssignments } = require('./sql');

/**
 * Data access for `chores`. Every read carries the latest chore_logs row as
 * last_done_on / last_done_by (null when never done). "Latest" is the highest
 * done_on, ties going to the highest id.
 */

const SELECT_SQL = `SELECT c.*, DATE_FORMAT(cl.done_on, '%Y-%m-%d') AS last_done_on, cl.done_by AS last_done_by
     FROM chores c
     LEFT JOIN chore_logs cl ON cl.id = (
         SELECT l.id FROM chore_logs l WHERE l.chore_id = c.id ORDER BY l.done_on DESC, l.id DESC LIMIT 1
     )`;

const UPDATABLE_COLUMNS = {
    name: 'name',
    area: 'area',
    windowMin: 'window_min',
    windowMax: 'window_max',
    notes: 'notes',
};

const findById = async (conn, id) => {
    const [rows] = await conn.execute(`${SELECT_SQL} WHERE c.id = ?`, [id]);

    return firstRow(rows) ?? null;
};

const create = async (conn, { ownerId, name, area = null, windowMin, windowMax, notes = null }) => {
    const [result] = await conn.execute(
        'INSERT INTO chores (owner_id, name, area, window_min, window_max, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [ownerId, name, area, windowMin, windowMax, notes]
    );

    return findById(conn, result.insertId);
};

/** Changes the given fields and returns the row, or null when there was no such chore. */
const update = async (conn, id, patch) => {
    const { clause, values } = buildAssignments(patch, UPDATABLE_COLUMNS);
    const [result] = await conn.execute(`UPDATE chores SET ${clause} WHERE id = ?`, [...values, id]);
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const setArchived = async (conn, id, isArchived) => {
    await conn.execute(
        `UPDATE chores SET archived_at = ${isArchived ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`,
        [id]
    );

    return findById(conn, id);
};

const listByOwner = async (conn, ownerId, { archived = false } = {}) => {
    const [rows] = await conn.execute(
        `${SELECT_SQL} WHERE c.owner_id = ? AND c.archived_at IS ${archived ? 'NOT NULL' : 'NULL'} ORDER BY c.id`,
        [ownerId]
    );

    return rows;
};

/** Every name the owner uses, archived chores included, since names are unique per owner. */
const listNamesByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute('SELECT name FROM chores WHERE owner_id = ?', [ownerId]);

    return rows.map((row) => row.name);
};

module.exports = { create, findById, listByOwner, listNamesByOwner, setArchived, update };
