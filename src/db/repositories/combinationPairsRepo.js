'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `combo_pairs`. A pair is unordered, so it is stored once with
 * the smaller card id as `card_a_id`.
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
 * for a new pair). Returns the row.
 */
const upsert = async (conn, deckId, cardX, cardY, fields) => {
    const cardA = Math.min(cardX, cardY);
    const cardB = Math.max(cardX, cardY);
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

/** How many pairs involving this card have a state other than 'empty'. */
const countFilledForCard = async (conn, cardId) => {
    const [rows] = await conn.execute(
        `SELECT COUNT(*) AS filled FROM combo_pairs
         WHERE (card_a_id = ? OR card_b_id = ?) AND state <> 'empty'`,
        [cardId, cardId]
    );

    return Number(firstRow(rows).filled);
};

module.exports = { countFilledForCard, listByDeck, upsert };
