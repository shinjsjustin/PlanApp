'use strict';

/**
 * Wire shapes for combinations. `owner_id` and timestamps of cards and pairs
 * stay server-side.
 */

/** `row` carries the repo's card_count and per-state counts. */
const toComboDeck = (row) => ({
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    sourceDeckId: row.source_deck_id,
    cardCount: Number(row.card_count),
    counts: {
        drafted: Number(row.drafted_count),
        done: Number(row.done_count),
        struck: Number(row.struck_count),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const toComboCard = (row) => ({
    id: row.id,
    deckId: row.deck_id,
    name: row.name,
    detail: row.detail,
    position: row.position,
});

const toComboPair = (row) => ({
    id: row.id,
    cardAId: row.card_a_id,
    cardBId: row.card_b_id,
    name: row.name,
    effect: row.effect,
    notes: row.notes,
    state: row.state,
});

module.exports = { toComboCard, toComboDeck, toComboPair };
