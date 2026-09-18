'use strict';

const { firstRow, buildAssignments } = require('./sql');

/**
 * Data access for `projects`. Every function takes the mysql2 connection or pool
 * to run on as its first argument, so callers control transaction boundaries and
 * tests can hand in a connection they later roll back.
 */

const UPDATABLE_COLUMNS = { title: 'title', description: 'description' };

const SELECT_COLUMNS = 'id, owner_id, title, description, created_at, updated_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM projects WHERE id = ?`,
        [id]
    );

    return firstRow(rows);
};

const create = async (conn, { ownerId, title, description = null }) => {
    const [result] = await conn.execute(
        'INSERT INTO projects (owner_id, title, description) VALUES (?, ?, ?)',
        [ownerId, title, description ?? null]
    );

    return findById(conn, result.insertId);
};

/** Lists a user's projects, newest first. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM projects
         WHERE owner_id = ?
         ORDER BY created_at DESC, id DESC`,
        [ownerId]
    );

    return rows;
};

/**
 * Aggregate columns for the projects home page: how many to-dos a project holds
 * and how many are done. Joined and grouped in the same statement as the project
 * itself, so listing N projects is still one query, not N+1 (spec section 4.4).
 */
const COUNT_COLUMNS =
    "COUNT(t.id) AS todo_count, COALESCE(SUM(t.status = 'complete'), 0) AS completed_todo_count";

const PROJECT_COLUMNS_WITH_COUNTS =
    'p.id, p.owner_id, p.title, p.description, p.created_at, p.updated_at';

/** Lists a user's projects with their to-do counts, newest first. */
const listByOwnerWithCounts = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${PROJECT_COLUMNS_WITH_COUNTS}, ${COUNT_COLUMNS}
         FROM projects p
         LEFT JOIN todos t ON t.project_id = p.id
         WHERE p.owner_id = ?
         GROUP BY p.id
         ORDER BY p.created_at DESC, p.id DESC`,
        [ownerId]
    );

    return rows;
};

/** One project with the same to-do counts the list carries. */
const findByIdWithCounts = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${PROJECT_COLUMNS_WITH_COUNTS}, ${COUNT_COLUMNS}
         FROM projects p
         LEFT JOIN todos t ON t.project_id = p.id
         WHERE p.id = ?
         GROUP BY p.id`,
        [id]
    );

    return firstRow(rows);
};

/** Applies a partial update. Returns the updated row, or null if it is gone. */
const update = async (conn, id, patch) => {
    const { clause, values } = buildAssignments(patch, UPDATABLE_COLUMNS);

    const existing = await findById(conn, id);
    if (!existing) return null;

    await conn.execute(`UPDATE projects SET ${clause} WHERE id = ?`, [...values, id]);

    return findById(conn, id);
};

/**
 * Deletes a project and everything under it. Returns true when a row was
 * removed, false when there was nothing to remove.
 *
 * The to-dos go first, explicitly, rather than by cascade. Deleting a project
 * cascades into both `sequences` and `todos`, and the `sequences` delete in turn
 * fires `todos.sequence_id` ON DELETE SET NULL — MySQL rejects that update
 * because it revalidates `fk_todos_project` against a project row the same
 * statement is deleting. Removing the to-dos first leaves nothing for the SET
 * NULL to touch; `layers` and `sequences` still cascade.
 *
 * Touches several tables, so callers run it inside a transaction.
 */
const remove = async (conn, id) => {
    await conn.execute('DELETE FROM todos WHERE project_id = ?', [id]);

    const [result] = await conn.execute('DELETE FROM projects WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

module.exports = {
    create,
    findById,
    findByIdWithCounts,
    listByOwner,
    listByOwnerWithCounts,
    update,
    remove,
};
