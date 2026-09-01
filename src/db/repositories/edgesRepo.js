'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `sequence_edges` — "the parent must finish before the child
 * can start". Edges have no ordering of their own, so there are no positions to
 * reindex here.
 *
 * This module persists edges; it does not decide which ones are legal. The
 * layer-ordering rule (`canConnect`, spec section 4.3) is applied at the route
 * boundary, where the layers are already loaded.
 */

const SELECT_COLUMNS = 'id, project_id, parent_id, child_id, created_at';

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

const findByPair = async (conn, parentId, childId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM sequence_edges
         WHERE parent_id = ? AND child_id = ?`,
        [parentId, childId]
    );

    return firstRow(rows);
};

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM sequence_edges WHERE id = ?`,
        [id]
    );

    return firstRow(rows);
};

const listByProject = async (conn, projectId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM sequence_edges
         WHERE project_id = ?
         ORDER BY id`,
        [projectId]
    );

    return rows;
};

/**
 * Every edge belonging to a user, across all their projects — the batched input
 * to the ready frontier on the projects home page (spec section 4.4). One query
 * for the whole page rather than one per project.
 */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT e.id, e.project_id, e.parent_id, e.child_id, e.created_at
         FROM sequence_edges e
         JOIN projects p ON p.id = e.project_id
         WHERE p.owner_id = ?
         ORDER BY e.project_id, e.id`,
        [ownerId]
    );

    return rows;
};

/**
 * True for the error `create` throws when the pair is already connected.
 *
 * The route layer needs to tell that case apart from a genuine fault to answer
 * 409 instead of 500, and matching on a message would break the moment the
 * wording changed. The flag is set by `create` below and nowhere else.
 */
const isDuplicateEdge = (err) => Boolean(err?.isDuplicateEdge);

/**
 * Creates an edge. The `(parent_id, child_id)` unique constraint is the single
 * source of truth for "already connected" — checking first and inserting after
 * would leave a window between the two — so the driver's error is caught and
 * retagged rather than pre-empted.
 */
const create = async (conn, { projectId, parentId, childId }) => {
    try {
        const [result] = await conn.execute(
            'INSERT INTO sequence_edges (project_id, parent_id, child_id) VALUES (?, ?, ?)',
            [projectId, parentId, childId]
        );

        return findById(conn, result.insertId);
    } catch (err) {
        if (err.code === DUPLICATE_ENTRY) {
            const duplicate = new Error(
                `Sequences ${parentId} and ${childId} are already connected`
            );
            duplicate.isDuplicateEdge = true;

            throw duplicate;
        }

        throw err;
    }
};

/** Returns true when an edge was removed, false when there was none. */
const remove = async (conn, parentId, childId) => {
    const [result] = await conn.execute(
        'DELETE FROM sequence_edges WHERE parent_id = ? AND child_id = ?',
        [parentId, childId]
    );

    return result.affectedRows > 0;
};

module.exports = {
    create,
    findById,
    findByPair,
    isDuplicateEdge,
    listByOwner,
    listByProject,
    remove,
};
