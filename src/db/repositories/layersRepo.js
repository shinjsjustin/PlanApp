'use strict';

const { firstRow, buildAssignments, applyPositions } = require('./sql');
const { insertAt, removeItem } = require('./positions');
const sequencesRepo = require('./sequencesRepo');

/**
 * Data access for `layers` — the horizontal bands of the canvas, ordered top to
 * bottom by a dense `position`. Callers pass the connection to run on, and wrap
 * anything that reindexes in a transaction.
 */

const TABLE = 'layers';

const UPDATABLE_COLUMNS = { title: 'title' };

const SELECT_COLUMNS = 'id, project_id, title, position, created_at, updated_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM layers WHERE id = ?`,
        [id]
    );

    return firstRow(rows);
};

const listByProject = async (conn, projectId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM layers
         WHERE project_id = ?
         ORDER BY position, id`,
        [projectId]
    );

    return rows;
};

/** The project's layer ids in display order — the input to the position helpers. */
const listIds = async (conn, projectId) => {
    const layers = await listByProject(conn, projectId);

    return layers.map((layer) => layer.id);
};

/**
 * Resolves where a new layer goes: appended by default, or directly below
 * `afterLayerId`. A layer id from a different project is a caller error, not a
 * silent append.
 */
const resolveInsertIndex = (ordering, projectId, afterLayerId) => {
    if (afterLayerId === undefined || afterLayerId === null) {
        return ordering.length;
    }

    const index = ordering.indexOf(afterLayerId);
    if (index === -1) {
        throw new Error(`Layer ${afterLayerId} is not in project ${projectId}`);
    }

    return index + 1;
};

const create = async (conn, { projectId, title, afterLayerId = null }) => {
    const ordering = await listIds(conn, projectId);
    const index = resolveInsertIndex(ordering, projectId, afterLayerId);

    // Insert at the end first, then let the reindex place it — that way the new
    // row never collides with an existing position.
    const columns = ['project_id', 'position'];
    const values = [projectId, ordering.length];

    if (title !== undefined) {
        columns.push('title');
        values.push(title);
    }

    const [result] = await conn.execute(
        `INSERT INTO layers (${columns.map((c) => `\`${c}\``).join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
        values
    );

    await applyPositions(conn, TABLE, insertAt(ordering, result.insertId, index));

    return findById(conn, result.insertId);
};

/** Applies a partial update. Returns the updated row, or null if it is gone. */
const update = async (conn, id, patch) => {
    const { clause, values } = buildAssignments(patch, UPDATABLE_COLUMNS);

    const existing = await findById(conn, id);
    if (!existing) return null;

    await conn.execute(`UPDATE layers SET ${clause} WHERE id = ?`, [...values, id]);

    return findById(conn, id);
};

/**
 * Deletes a layer and closes the gap it leaves. Its sequences go with it, and
 * their to-dos survive, unorganized (schema: `todos.sequence_id` SET NULL).
 *
 * The sequences are deleted one at a time through `sequencesRepo` rather than
 * left to the database's cascade. That cascade only nulls `todos.sequence_id`;
 * it knows nothing about ordering, so the freed to-dos would keep the positions
 * they held inside their sequence and collide with the unorganized ones. The
 * fix-up for that belongs to `sequencesRepo.remove`, and this defers to it
 * rather than restating it.
 *
 * Rewrites several tables, so callers run it inside a transaction.
 */
const remove = async (conn, id) => {
    const existing = await findById(conn, id);
    if (!existing) return false;

    const ordering = await listIds(conn, existing.project_id);
    const sequenceIds = await sequencesRepo.listIds(conn, id);

    for (const sequenceId of sequenceIds) {
        // Sequential: one mysql2 connection runs one statement at a time, and
        // each delete reindexes lists that the next one then reads.
        // eslint-disable-next-line no-await-in-loop
        await sequencesRepo.remove(conn, sequenceId);
    }

    await conn.execute('DELETE FROM layers WHERE id = ?', [id]);
    await applyPositions(conn, TABLE, removeItem(ordering, id));

    return true;
};

module.exports = { create, findById, listByProject, listIds, update, remove };
