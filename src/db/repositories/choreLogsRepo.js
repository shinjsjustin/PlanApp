'use strict';

const { firstRow, buildAssignments } = require('./sql');

/** Data access for `chore_logs`; done_on is returned as 'YYYY-MM-DD'. */

const SELECT_SQL = "SELECT cl.*, DATE_FORMAT(cl.done_on, '%Y-%m-%d') AS done_on FROM chore_logs cl";

const UPDATABLE_COLUMNS = { doneOn: 'done_on', doneBy: 'done_by' };

const findById = async (conn, id) => {
    const [rows] = await conn.execute(`${SELECT_SQL} WHERE cl.id = ?`, [id]);

    return firstRow(rows) ?? null;
};

const create = async (conn, { choreId, doneOn, doneBy }) => {
    const [result] = await conn.execute(
        'INSERT INTO chore_logs (chore_id, done_on, done_by) VALUES (?, ?, ?)',
        [choreId, doneOn, doneBy]
    );

    return findById(conn, result.insertId);
};

const listByChore = async (conn, choreId) => {
    const [rows] = await conn.execute(
        `${SELECT_SQL} WHERE cl.chore_id = ? ORDER BY cl.done_on DESC, cl.id DESC`,
        [choreId]
    );

    return rows;
};

/** Changes the given fields and returns the row, or null when there was no such log. */
const update = async (conn, id, patch) => {
    const { clause, values } = buildAssignments(patch, UPDATABLE_COLUMNS);
    const [result] = await conn.execute(`UPDATE chore_logs SET ${clause} WHERE id = ?`, [...values, id]);
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM chore_logs WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

module.exports = { create, findById, listByChore, remove, update };
