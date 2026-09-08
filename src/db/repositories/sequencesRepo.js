'use strict';

const { firstRow, buildAssignments, applyPositions } = require('./sql');
const { insertAt, moveItem, removeItem } = require('./positions');
const todosRepo = require('./todosRepo');

/**
 * Data access for `sequences` — the cards inside a layer, ordered left to right
 * by a dense `position`.
 *
 * Only the manual `is_blocked` override is persisted here. Everything else about
 * a sequence's status is derived from its to-dos (spec section 4.3), so it can
 * never go stale. `is_collapsed` sits alongside it but is not status at all — it
 * is whether the card is folded shut, remembered per sequence.
 *
 * `move` is the one function here that touches another table: a sequence
 * changing layer can invalidate edges that were legal when they were made, and
 * they go with the move. See the note on `DELETE_INVALID_EDGES`.
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
 * The SQL that drops every edge touching a sequence which no longer points
 * strictly downward.
 *
 * `assertCanConnect` is the rule at the boundary: a parent's layer must be
 * strictly above its child's. A sequence changing layer can break that for edges
 * that were valid when they were made — so they are deleted with the move rather
 * than left to make the graph mean something it does not (spec decision 2).
 *
 * Strictly: `>=` catches the same-layer case as well as the upward one. Two
 * sequences in one band are parallel work and neither gates the other.
 */
const DELETE_INVALID_EDGES = `
    DELETE e FROM sequence_edges e
    JOIN sequences ps ON ps.id = e.parent_id
    JOIN sequences cs ON cs.id = e.child_id
    JOIN layers pl ON pl.id = ps.layer_id
    JOIN layers cl ON cl.id = cs.layer_id
    WHERE (e.parent_id = ? OR e.child_id = ?)
      AND pl.position >= cl.position`;

/**
 * Puts a sequence at a position in a layer — the verb behind dragging a card
 * from one band to another, and behind reordering one within its band.
 *
 * Modelled on `todosRepo.move`, and for the same reason: a layer is an ordered
 * list like any other, so filing a sequence into a different one and shuffling
 * it within its own are the same operation over one or two lists.
 *
 * The target index is validated BEFORE anything is written, so a bad position
 * cannot leave the sequence detached from the layer it came from. Callers run
 * this inside a transaction; it rewrites two tables.
 *
 * Trusts its caller on project membership: this does not check that `layerId`
 * belongs to the sequence's project (see `assertLayerInProject`, the route's
 * job). A repo-level cross-project move is a defence-in-depth question, not one
 * this function answers.
 *
 * Returns the updated row, or null when the sequence is gone.
 */
const move = async (conn, id, { layerId, position }) => {
    const sequence = await findById(conn, id);
    if (!sequence) return null;

    const sourceOrdering = await listIds(conn, sequence.layer_id);

    if (sequence.layer_id === layerId) {
        await applyPositions(conn, TABLE, moveItem(sourceOrdering, id, position));

        return findById(conn, id);
    }

    const targetOrdering = await listIds(conn, layerId);
    // Validate the index before writing anything, so a bad position cannot leave
    // the sequence detached from its old layer.
    const newTargetOrdering = insertAt(targetOrdering, id, position);

    await conn.execute('UPDATE sequences SET layer_id = ? WHERE id = ?', [layerId, id]);
    await applyPositions(conn, TABLE, removeItem(sourceOrdering, id));
    await applyPositions(conn, TABLE, newTargetOrdering);
    await conn.execute(DELETE_INVALID_EDGES, [id, id]);

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
    move,
    update,
    remove,
};
