'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `combo_pairs`. A pair is unordered by default, so it is stored
 * once with the smaller card id as `card_a_id`; ordered pairs keep the given order.
 */

const SELECT_COLUMNS =
    'id, deck_id, card_a_id, card_b_id, name, effect, notes, state, created_at, updated_at';

const listByDeck = async (conn, deckId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM combo_pairs WHERE deck_id = ? ORDER BY card_a_id, card_b_id`,
        [deckId]
    );

    return rows;
};

/**
 * Creates or updates the pair between two cards. `fields` may hold name, effect,
 * notes and state; any left out keep their stored value (or the column default
 * for a new pair). With `ordered`, (A, B) and (B, A) are separate pairs. Returns the row.
 */
const upsert = async (conn, deckId, cardX, cardY, fields, { ordered = false } = {}) => {
    const cardA = ordered ? cardX : Math.min(cardX, cardY);
    const cardB = ordered ? cardY : Math.max(cardX, cardY);
    const { name = null, effect = null, notes = null, state = null } = fields;

    await conn.execute(
        `INSERT INTO combo_pairs (deck_id, card_a_id, card_b_id, name, effect, notes, state)
         VALUES (?, ?, ?, COALESCE(?, ''), COALESCE(?, ''), COALESCE(?, ''), COALESCE(?, 'empty'))
         ON DUPLICATE KEY UPDATE
             name = COALESCE(?, name),
             effect = COALESCE(?, effect),
             notes = COALESCE(?, notes),
             state = COALESCE(?, state)`,
        [deckId, cardA, cardB, name, effect, notes, state, name, effect, notes, state]
    );

    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM combo_pairs WHERE card_a_id = ? AND card_b_id = ?`,
        [cardA, cardB]
    );

    return firstRow(rows);
};

/** Returns true when a pair was deleted. */
const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM combo_pairs WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

/** Sets the card ids exactly as given (no sorting). Returns the row, or null when missing. */
const setCards = async (conn, id, cardAId, cardBId) => {
    const [result] = await conn.execute(
        'UPDATE combo_pairs SET card_a_id = ?, card_b_id = ? WHERE id = ?',
        [cardAId, cardBId, id]
    );
    if (result.affectedRows === 0) return null;

    const [rows] = await conn.execute(`SELECT ${SELECT_COLUMNS} FROM combo_pairs WHERE id = ?`, [id]);

    return firstRow(rows);
};

/** How many pairs involving this card have a state other than 'empty'. */
const countFilledForCard = async (conn, cardId) => {
    const [rows] = await conn.execute(
        `SELECT COUNT(*) AS filled FROM combo_pairs
         WHERE (card_a_id = ? OR card_b_id = ?) AND state <> 'empty'`,
        [cardId, cardId]
    );

    return Number(firstRow(rows).filled);
};

module.exports = { countFilledForCard, listByDeck, remove, setCards, upsert };
