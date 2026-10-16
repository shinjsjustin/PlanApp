'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `project_thoughts` — one autosaved note per project. Callers
 * check project ownership first; every method here trusts the project id.
 */

const SELECT_COLUMNS = 'project_id, text, version, updated_at';

const findByProject = async (conn, projectId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM project_thoughts WHERE project_id = ?`,
        [projectId]
    );

    return firstRow(rows) ?? null;
};

/**
 * Locks the project row, so saves for one project serialize even before its
 * thoughts row exists, then returns the thoughts row or null.
 */
const findForUpdate = async (conn, projectId) => {
    await conn.execute('SELECT id FROM projects WHERE id = ? FOR UPDATE', [projectId]);
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM project_thoughts WHERE project_id = ? FOR UPDATE`,
        [projectId]
    );

    return firstRow(rows) ?? null;
};

/** Creates the row at version 1, or replaces the text and adds 1 to version. */
const save = async (conn, projectId, text) => {
    await conn.execute(
        `INSERT INTO project_thoughts (project_id, text) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE text = VALUES(text), version = version + 1`,
        [projectId, text]
    );

    return findByProject(conn, projectId);
};

module.exports = { findByProject, findForUpdate, save };
