'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `combo_cards`. Positions are 0-based and contiguous within a
 * deck. Moves and removals touch several rows, so callers run them inside
 * `withTransaction`.
 */

const SELECT_COLUMNS = 'id, deck_id, name, detail, position, created_at, updated_at';

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
const create = async (conn, { deckId, name, detail = '' }) => {
    const [result] = await conn.execute(
        `INSERT INTO combo_cards (deck_id, name, detail, position)
         SELECT ?, ?, ?, COUNT(*) FROM combo_cards WHERE deck_id = ?`,
        [deckId, name, detail, deckId]
    );

    return findById(conn, result.insertId);
};

/** Fields left out are kept. Returns the row, or null when missing. */
const update = async (conn, id, { name, detail }) => {
    const [result] = await conn.execute(
        'UPDATE combo_cards SET name = COALESCE(?, name), detail = COALESCE(?, detail) WHERE id = ?',
        [name ?? null, detail ?? null, id]
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

module.exports = { create, findById, listByDeck, move, remove, update };
