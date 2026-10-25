'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `combo_decks`. A deck belongs directly to a user and may be
 * linked to one project; deleting that project unlinks the deck (ON DELETE SET NULL).
 */

const SELECT_COLUMNS = 'id, owner_id, project_id, source_deck_id, name, pair_mode, is_recipe, created_at, updated_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM combo_decks WHERE id = ?`,
        [id]
    );

    return firstRow(rows) ?? null;
};

/**
 * Each deck with its card count and how many of its pairs are in each state.
 * Counts come from subqueries so cards and pairs do not multiply each other.
 * Pass `projectId` to limit the list to one project's decks.
 */
const listByOwner = async (conn, ownerId, { projectId } = {}) => {
    const filterByProject = projectId !== undefined;
    const [rows] = await conn.execute(
        `SELECT d.id, d.owner_id, d.project_id, d.source_deck_id, d.name, d.pair_mode, d.is_recipe, d.created_at, d.updated_at,
                (SELECT COUNT(*) FROM combo_cards c WHERE c.deck_id = d.id) AS card_count,
                (SELECT COUNT(*) FROM combo_pairs p WHERE p.deck_id = d.id AND p.state = 'drafted') AS drafted_count,
                (SELECT COUNT(*) FROM combo_pairs p WHERE p.deck_id = d.id AND p.state = 'done') AS done_count,
                (SELECT COUNT(*) FROM combo_pairs p WHERE p.deck_id = d.id AND p.state = 'struck') AS struck_count
         FROM combo_decks d
         WHERE d.owner_id = ?${filterByProject ? ' AND d.project_id = ?' : ''}
         ORDER BY d.name, d.id`,
        filterByProject ? [ownerId, projectId] : [ownerId]
    );

    return rows;
};

const create = async (conn, {
    ownerId,
    name,
    projectId = null,
    sourceDeckId = null,
    mode = 'combinations',
    recipe = false,
}) => {
    const [result] = await conn.execute(
        'INSERT INTO combo_decks (owner_id, project_id, source_deck_id, name, pair_mode, is_recipe) VALUES (?, ?, ?, ?, ?, ?)',
        [ownerId, projectId, sourceDeckId, name, mode, recipe ? 1 : 0]
    );

    return findById(conn, result.insertId);
};

/** Fields left out are kept; `projectId: null` unlinks. Returns the row, or null when missing. */
const update = async (conn, id, { name, projectId, mode, recipe }) => {
    const [result] = await conn.execute(
        `UPDATE combo_decks
         SET name = COALESCE(?, name),
             project_id = IF(?, ?, project_id),
             pair_mode = COALESCE(?, pair_mode),
             is_recipe = COALESCE(?, is_recipe)
         WHERE id = ?`,
        [name ?? null, projectId !== undefined, projectId ?? null, mode ?? null, recipe === undefined ? null : Number(recipe), id]
    );
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM combo_decks WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

/** True when the owner already has a deck with this name, ignoring `exceptId`. */
const nameTaken = async (conn, ownerId, name, exceptId = null) => {
    const [rows] = await conn.execute(
        'SELECT 1 FROM combo_decks WHERE owner_id = ? AND name = ? AND id <> ? LIMIT 1',
        [ownerId, name, exceptId ?? 0]
    );

    return rows.length > 0;
};

module.exports = { create, findById, listByOwner, nameTaken, remove, update };
