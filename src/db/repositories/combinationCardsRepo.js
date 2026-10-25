'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `combo_cards`. Positions are 0-based and contiguous within a
 * deck. Moves and removals touch several rows, so callers run them inside
 * `withTransaction`.
 */

const SELECT_COLUMNS = 'id, deck_id, name, detail, position, on_x, on_y, is_crafted, created_at, updated_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM combo_cards WHERE id = ?`,
        [id]
    );

    return firstRow(rows) ?? null;
};

const listByDeck = async (conn, deckId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM combo_cards WHERE deck_id = ? ORDER BY position`,
        [deckId]
    );

    return rows;
};

/** Appends after the deck's last card. */
const create = async (conn, { deckId, name, detail = '', onX = false, onY = false, crafted = false }) => {
    const [result] = await conn.execute(
        `INSERT INTO combo_cards (deck_id, name, detail, position, on_x, on_y, is_crafted)
         SELECT ?, ?, ?, COUNT(*), ?, ?, ? FROM combo_cards WHERE deck_id = ?`,
        [deckId, name, detail, onX ? 1 : 0, onY ? 1 : 0, crafted ? 1 : 0, deckId]
    );

    return findById(conn, result.insertId);
};

/** The first card by position whose trimmed name matches, ignoring case, or null. */
const findByName = async (conn, deckId, name) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM combo_cards
         WHERE deck_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))
         ORDER BY position LIMIT 1`,
        [deckId, name]
    );

    return firstRow(rows) ?? null;
};

/** Fields left out are kept. Returns the row, or null when missing. */
const update = async (conn, id, { name, detail, onX, onY }) => {
    const [result] = await conn.execute(
        `UPDATE combo_cards
         SET name = COALESCE(?, name),
             detail = COALESCE(?, detail),
             on_x = COALESCE(?, on_x),
             on_y = COALESCE(?, on_y)
         WHERE id = ?`,
        [name ?? null, detail ?? null, onX === undefined ? null : Number(onX), onY === undefined ? null : Number(onY), id]
    );
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

/** Swaps with the neighbour in `direction` ('up' or 'down'); does nothing at an end. */
const move = async (conn, id, direction) => {
    const card = await findById(conn, id);
    if (!card) return null;

    const targetPosition = direction === 'up' ? card.position - 1 : card.position + 1;
    const [rows] = await conn.execute(
        'SELECT id FROM combo_cards WHERE deck_id = ? AND position = ?',
        [card.deck_id, targetPosition]
    );
    const neighbour = firstRow(rows);
    if (!neighbour) return card;

    await conn.execute('UPDATE combo_cards SET position = ? WHERE id = ?', [
        card.position,
        neighbour.id,
    ]);
    await conn.execute('UPDATE combo_cards SET position = ? WHERE id = ?', [targetPosition, id]);

    return findById(conn, id);
};

/** Deletes the card (its pairs cascade) and closes the gap behind it. */
const remove = async (conn, id) => {
    const card = await findById(conn, id);
    if (!card) return false;

    await conn.execute('DELETE FROM combo_cards WHERE id = ?', [id]);
    await conn.execute(
        'UPDATE combo_cards SET position = position - 1 WHERE deck_id = ? AND position > ?',
        [card.deck_id, card.position]
    );

    return true;
};

module.exports = { create, findById, findByName, listByDeck, move, remove, update };
