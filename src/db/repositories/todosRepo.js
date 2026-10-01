'use strict';

const { firstRow, buildAssignments, applyPositions } = require('./sql');
const { insertAt, removeItem, moveItem } = require('./positions');

/**
 * Data access for `todos`.
 *
 * A to-do belongs to exactly one ordered list: either a sequence, or — when
 * `sequence_id IS NULL` — the project's unorganized panel. Positions are dense
 * within a list, so the two lists number themselves independently.
 */

const TABLE = 'todos';

const COMPLETE = 'complete';

/**
 * `completedAt` is in the allow-list because `update` derives it below, not
 * because a caller may send it: no route schema accepts the field, so the only
 * thing that ever writes `completed_at` is the status transition itself.
 */
const UPDATABLE_COLUMNS = {
    text: 'text',
    status: 'status',
    note: 'note',
    completedAt: 'completed_at',
};

const SELECT_COLUMNS =
    'id, project_id, sequence_id, text, note, status, completed_at, is_pinned, position, created_at, updated_at';

// `project_id` is not part of the pinned wire shape, but carrying it here lets
// the projects home payload group pins by project without a second read.
const PINNED_SELECT_COLUMNS =
    't.id, t.project_id, t.text, t.status, t.sequence_id, s.title AS sequence_title, t.position, t.is_pinned';

const PINNED_FROM_JOINS = `FROM todos t
    LEFT JOIN sequences s ON s.id = t.sequence_id
    LEFT JOIN layers l ON l.id = s.layer_id`;

const PINNED_ORDER =
    't.sequence_id IS NULL, l.position, s.position, t.position, t.id';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM todos WHERE id = ?`,
        [id]
    );

    return firstRow(rows);
};

/** Use a current locking read for transactional reconciliation, even on no-op updates. */
const findByIds = async (conn, todoIds, { forUpdate = false } = {}) => {
    if (todoIds.length === 0) return [];

    const placeholders = todoIds.map(() => '?').join(', ');
    // `query` rather than `execute`: the placeholder count varies per call.
    const [rows] = await conn.query(
        `SELECT ${SELECT_COLUMNS} FROM todos
         WHERE id IN (${placeholders})
         ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`,
        todoIds
    );

    return rows;
};

const listByProject = async (conn, projectId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM todos
         WHERE project_id = ?
         ORDER BY sequence_id, position, id`,
        [projectId]
    );

    return rows;
};

/**
 * Every to-do belonging to a user, across all their projects, filed and
 * unorganized alike. One query rather than one per project or sequence.
 */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT t.${SELECT_COLUMNS.split(', ').join(', t.')}
         FROM todos t
         JOIN projects p ON p.id = t.project_id
         WHERE p.owner_id = ?
         ORDER BY t.project_id, t.sequence_id, t.position, t.id`,
        [ownerId]
    );

    return rows;
};

/** Owner's pins, contiguous by project and in pinned-list order within each group. */
const listPinnedByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${PINNED_SELECT_COLUMNS}
         ${PINNED_FROM_JOINS}
         JOIN projects p ON p.id = t.project_id
         WHERE p.owner_id = ? AND t.is_pinned = 1
         ORDER BY t.project_id, ${PINNED_ORDER}`,
        [ownerId]
    );

    return rows;
};

/** Every pinned to-do in one project, including unorganized rows. */
const listPinnedByProject = async (conn, projectId) => {
    const [rows] = await conn.execute(
        `SELECT ${PINNED_SELECT_COLUMNS}
         ${PINNED_FROM_JOINS}
         WHERE t.project_id = ? AND t.is_pinned = 1
         ORDER BY ${PINNED_ORDER}`,
        [projectId]
    );

    return rows;
};

/** Pins or unpins all named to-dos in one statement. */
const setPinned = async (conn, todoIds, isPinned) => {
    if (todoIds.length === 0) return 0;

    const placeholders = todoIds.map(() => '?').join(', ');
    // `query` rather than `execute`: the placeholder count varies per call.
    const [result] = await conn.query(
        `UPDATE todos SET is_pinned = ? WHERE id IN (${placeholders})`,
        [Number(Boolean(isPinned)), ...todoIds]
    );

    return result.affectedRows;
};

/**
 * The to-dos of one list. `sequenceId` of null means the unorganized panel.
 *
 * The two cases deliberately use two different SQL statements rather than one
 * NULL-safe `sequence_id <=> ?`. mysql2 caches server-side prepared statements by
 * SQL text and reuses the parameter types from the first execution, so a single
 * statement bound once with a sequence id then re-bound with NULL silently
 * returns no rows. Distinct statements keep each parameter type stable.
 */
const listInList = async (conn, projectId, sequenceId) => {
    if (sequenceId === null || sequenceId === undefined) {
        const [rows] = await conn.execute(
            `SELECT ${SELECT_COLUMNS} FROM todos
             WHERE project_id = ? AND sequence_id IS NULL
             ORDER BY position, id`,
            [projectId]
        );

        return rows;
    }

    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM todos
         WHERE project_id = ? AND sequence_id = ?
         ORDER BY position, id`,
        [projectId, sequenceId]
    );

    return rows;
};

const listUnorganized = async (conn, projectId) => listInList(conn, projectId, null);

const listBySequence = async (conn, sequenceId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM todos
         WHERE sequence_id = ?
         ORDER BY position, id`,
        [sequenceId]
    );

    return rows;
};

/** To-dos of the given sequences, grouped by sequence then in position order. */
const listBySequenceIds = async (conn, sequenceIds) => {
    if (sequenceIds.length === 0) return [];

    // `query` rather than `execute`: the placeholder count varies per call.
    const [rows] = await conn.query(
        `SELECT ${SELECT_COLUMNS} FROM todos
         WHERE sequence_id IN (?)
         ORDER BY sequence_id, position, id`,
        [sequenceIds]
    );

    return rows;
};

/** A list's to-do ids in display order — the input to the position helpers. */
const listIds = async (conn, projectId, sequenceId) => {
    const todos = await listInList(conn, projectId, sequenceId);

    return todos.map((todo) => todo.id);
};

/** Creates a to-do at the end of its list — a sequence, or the unorganized panel. */
const create = async (conn, { projectId, text, sequenceId = null }) => {
    const targetSequenceId = sequenceId ?? null;
    const ordering = await listIds(conn, projectId, targetSequenceId);

    const [result] = await conn.execute(
        'INSERT INTO todos (project_id, sequence_id, text, position) VALUES (?, ?, ?, ?)',
        [projectId, targetSequenceId, text, ordering.length]
    );

    await applyPositions(conn, TABLE, insertAt(ordering, result.insertId, ordering.length));

    return findById(conn, result.insertId);
};

/**
 * When a to-do becomes complete, and when it stops being. The DONE group on a
 * sequence card reads it, so it has to be the moment of the tick rather than the
 * moment of the last edit — `updated_at` moves when a finished to-do is renamed
 * or dragged, and would drift.
 *
 * Only a real transition writes it: re-sending the status a to-do already has
 * leaves the original stamp alone, so a no-op PATCH cannot backdate the list.
 * Returns a patch fragment to merge, empty when nothing changed.
 */
const completionStampFor = (existing, patch) => {
    if (patch.status === undefined || patch.status === existing.status) return {};

    return { completedAt: patch.status === COMPLETE ? new Date() : null };
};

/** Applies a partial update. Returns the updated row, or null if it is gone. */
const update = async (conn, id, patch) => {
    // Validated before the read so an empty patch still throws, as it always has.
    buildAssignments(patch, UPDATABLE_COLUMNS);

    const existing = await findById(conn, id);
    if (!existing) return null;

    const { clause, values } = buildAssignments(
        { ...patch, ...completionStampFor(existing, patch) },
        UPDATABLE_COLUMNS
    );

    await conn.execute(`UPDATE todos SET ${clause} WHERE id = ?`, [...values, id]);

    return findById(conn, id);
};

/**
 * Confirms the move target is a list this to-do may join: the unorganized panel,
 * or a sequence in the same project. A sequence from another project is a caller
 * error, never a silent no-op.
 */
const assertTargetInProject = async (conn, projectId, sequenceId) => {
    if (sequenceId === null) return;

    const [rows] = await conn.execute('SELECT project_id FROM sequences WHERE id = ?', [
        sequenceId,
    ]);
    const sequence = firstRow(rows);

    if (!sequence || sequence.project_id !== projectId) {
        throw new Error(`Sequence ${sequenceId} is not in project ${projectId}`);
    }
};

/**
 * Puts a to-do at `position` in the target list, covering both the drag-in and
 * the reorder case. Returns the moved row, or null if the to-do is gone.
 *
 * Callers wrap this in a transaction: it rewrites positions in up to two lists.
 */
const move = async (conn, id, { sequenceId, position }) => {
    const todo = await findById(conn, id);
    if (!todo) return null;

    const targetSequenceId = sequenceId ?? null;
    await assertTargetInProject(conn, todo.project_id, targetSequenceId);

    const sourceOrdering = await listIds(conn, todo.project_id, todo.sequence_id);

    if (todo.sequence_id === targetSequenceId) {
        await applyPositions(conn, TABLE, moveItem(sourceOrdering, id, position));

        return findById(conn, id);
    }

    const targetOrdering = await listIds(conn, todo.project_id, targetSequenceId);
    // Validate the index before writing anything, so a bad position cannot leave
    // the to-do detached from its old list.
    const newTargetOrdering = insertAt(targetOrdering, id, position);

    await conn.execute('UPDATE todos SET sequence_id = ? WHERE id = ?', [targetSequenceId, id]);
    await applyPositions(conn, TABLE, removeItem(sourceOrdering, id));
    await applyPositions(conn, TABLE, newTargetOrdering);

    return findById(conn, id);
};

/** Deletes a to-do and closes the gap in whichever list it was in. */
const remove = async (conn, id) => {
    const existing = await findById(conn, id);
    if (!existing) return false;

    const ordering = await listIds(conn, existing.project_id, existing.sequence_id);

    await conn.execute('DELETE FROM todos WHERE id = ?', [id]);
    await applyPositions(conn, TABLE, removeItem(ordering, id));

    return true;
};

/**
 * Deletes every unorganized to-do of a project in one statement and returns the
 * ids. Bookings go with them through the foreign key; nothing is left to
 * reposition because the whole list is removed.
 */
const removeUnorganized = async (conn, projectId) => {
    const ids = (await listUnorganized(conn, projectId)).map((row) => row.id);

    if (ids.length === 0) return ids;

    const placeholders = ids.map(() => '?').join(', ');
    // `query` rather than `execute`: the placeholder count varies per call.
    await conn.query(`DELETE FROM todos WHERE id IN (${placeholders})`, ids);

    return ids;
};

module.exports = {
    create,
    findById,
    findByIds,
    listByOwner,
    listPinnedByOwner,
    listPinnedByProject,
    listByProject,
    listUnorganized,
    listBySequence,
    listBySequenceIds,
    listIds,
    update,
    move,
    remove,
    removeUnorganized,
    setPinned,
};
