'use strict';

const { firstRow, buildAssignments, applyPositions } = require('./sql');
const { insertAt, removeItem } = require('./positions');
const todosRepo = require('./todosRepo');

/**
 * Data access for `sequences` — the cards inside a layer, ordered left to right
 * by a dense `position`.
 *
 * Only the manual `is_blocked` override is persisted here. Everything else about
 * a sequence's status is derived from its to-dos (spec section 4.3), so it can
 * never go stale. `is_collapsed` sits alongside it but is not status at all — it
 * is whether the card is folded shut, remembered per sequence.
 */

const TABLE = 'sequences';
const TODOS_TABLE = 'todos';

const UPDATABLE_COLUMNS = {
    title: 'title',
    description: 'description',
    isBlocked: 'is_blocked',
    isCollapsed: 'is_collapsed',
};

const SELECT_COLUMNS =
    'id, project_id, layer_id, title, description, is_blocked, is_collapsed, position, ' +
    'created_at, updated_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM sequences WHERE id = ?`,
        [id]
    );

    return firstRow(rows);
};

const listByLayer = async (conn, layerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM sequences
         WHERE layer_id = ?
         ORDER BY position, id`,
        [layerId]
    );

    return rows;
};

/** Every sequence in a project, ordered by layer then by position within it. */
const listByProject = async (conn, projectId) => {
    const [rows] = await conn.execute(
        `SELECT s.${SELECT_COLUMNS.split(', ').join(', s.')}
         FROM sequences s
         JOIN layers l ON l.id = s.layer_id
         WHERE s.project_id = ?
         ORDER BY l.position, s.position, s.id`,
        [projectId]
    );

    return rows;
};

/**
 * Every sequence belonging to a user, across all their projects — the batched
 * input to the ready frontier on the projects home page (spec section 4.4).
 *
 * One query for the whole home page, not one per project: the join walks up to
 * `projects.owner_id` so the caller groups the rows in memory instead of asking
 * the database N times.
 */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT s.${SELECT_COLUMNS.split(', ').join(', s.')}
         FROM sequences s
         JOIN projects p ON p.id = s.project_id
         JOIN layers l ON l.id = s.layer_id
         WHERE p.owner_id = ?
         ORDER BY s.project_id, l.position, s.position, s.id`,
        [ownerId]
    );

    return rows;
};

/** The layer's sequence ids in display order — the input to the position helpers. */
const listIds = async (conn, layerId) => {
    const sequences = await listByLayer(conn, layerId);

    return sequences.map((sequence) => sequence.id);
};

/**
 * Creates a sequence at the end of its layer. `project_id` is derived from the
 * layer rather than taken from the caller, so the two can never disagree.
 */
const create = async (conn, { layerId, title, description }) => {
    const [layerRows] = await conn.execute(
        'SELECT id, project_id FROM layers WHERE id = ?',
        [layerId]
    );
    const layer = firstRow(layerRows);

    if (!layer) {
        throw new Error(`Layer ${layerId} does not exist`);
    }

    const ordering = await listIds(conn, layerId);

    const columns = ['project_id', 'layer_id', 'position'];
    const values = [layer.project_id, layerId, ordering.length];

    if (title !== undefined) {
        columns.push('title');
        values.push(title);
    }
    if (description !== undefined) {
        columns.push('description');
        values.push(description);
    }

    const [result] = await conn.execute(
        `INSERT INTO sequences (${columns.map((c) => `\`${c}\``).join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
        values
    );

    await applyPositions(conn, TABLE, insertAt(ordering, result.insertId, ordering.length));

    return findById(conn, result.insertId);
};

/** Applies a partial update. Returns the updated row, or null if it is gone. */
const update = async (conn, id, patch) => {
    const normalised =
        patch.isBlocked === undefined ? patch : { ...patch, isBlocked: patch.isBlocked ? 1 : 0 };

    const { clause, values } = buildAssignments(normalised, UPDATABLE_COLUMNS);

    const existing = await findById(conn, id);
    if (!existing) return null;

    await conn.execute(`UPDATE sequences SET ${clause} WHERE id = ?`, [...values, id]);

    return findById(conn, id);
};

/**
 * Deletes a sequence and closes the gap in its layer. Its to-dos are not deleted:
 * `todos.sequence_id` is ON DELETE SET NULL, so they return to the unorganized
 * panel. Its edges cascade away.
 *
 * The database only nulls the column — it knows nothing about positions — so the
 * freed to-dos would keep the positions they held inside the sequence and
 * collide with the unorganized ones. They are appended to the end of the
 * unorganized list and both lists are reindexed here.
 *
 * Rewrites several tables, so callers run it inside a transaction.
 */
const remove = async (conn, id) => {
    const existing = await findById(conn, id);
    if (!existing) return false;

    const ordering = await listIds(conn, existing.layer_id);
    const freed = await todosRepo.listBySequence(conn, id);
    const unorganized = await todosRepo.listUnorganized(conn, existing.project_id);

    await conn.execute('DELETE FROM sequences WHERE id = ?', [id]);
    await applyPositions(conn, TABLE, removeItem(ordering, id));
    await applyPositions(conn, TODOS_TABLE, [
        ...unorganized.map((todo) => todo.id),
        ...freed.map((todo) => todo.id),
    ]);

    return true;
};

module.exports = {
    create,
    findById,
    listByLayer,
    listByOwner,
    listByProject,
    listIds,
    update,
    remove,
};
