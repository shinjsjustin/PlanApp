'use strict';

const { badRequest, forbidden, notFound } = require('./httpError');

/**
 * Confirms a set of to-dos exists, belongs to the caller, and is in one project.
 *
 * The complete set is checked in one query before a bulk operation can write.
 * Missing rows are reported first, then foreign ownership, then a caller-owned
 * row from the wrong project. Deduplication keeps repeated ids from defeating
 * the result-count check.
 */
const assertTodosInProject = async (conn, todoIds, projectId, userId) => {
    const unique = [...new Set(todoIds)];

    if (unique.length === 0) return;

    const placeholders = unique.map(() => '?').join(', ');
    const [rows] = await conn.query(
        `SELECT t.id, t.project_id, p.owner_id
         FROM todos t
         JOIN projects p ON p.id = t.project_id
         WHERE t.id IN (${placeholders})`,
        unique
    );

    if (rows.length !== unique.length) throw notFound('To-do');
    if (rows.some((row) => row.owner_id !== userId)) throw forbidden();

    const wrongProject = rows.find((row) => row.project_id !== projectId);
    if (wrongProject) {
        throw badRequest(`todoIds: to-do ${wrongProject.id} is not in this project`);
    }
};

module.exports = assertTodosInProject;
