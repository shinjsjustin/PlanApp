'use strict';

const cardsRepo = require('../db/repositories/combinationCardsRepo');
const pairsRepo = require('../db/repositories/combinationPairsRepo');
const { conflict } = require('./httpError');

const isFilled = (pair) => pair.state !== 'empty';

/**
 * Folds a permutations deck's ordered pairs into unordered ones: each couple keeps
 * its filled row (or one row when both are empty) with the smaller card id first.
 * Throws a 409 naming the couples where both orders are filled, changing nothing.
 */
const foldToCombinations = async (conn, deckId) => {
    const cards = await cardsRepo.listByDeck(conn, deckId);
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const couples = new Map();
    for (const pair of await pairsRepo.listByDeck(conn, deckId)) {
        const key = `${Math.min(pair.card_a_id, pair.card_b_id)}:${Math.max(pair.card_a_id, pair.card_b_id)}`;
        couples.set(key, [...(couples.get(key) ?? []), pair]);
    }

    const clashes = [...couples.values()].filter((rows) => rows.filter(isFilled).length > 1);
    if (clashes.length > 0) {
        const names = clashes
            .map(([pair]) => [cardById.get(pair.card_a_id), cardById.get(pair.card_b_id)])
            .map((couple) => couple.sort((x, y) => x.position - y.position).map((card) => card.name).join(' + '));
        throw conflict(`Both orders are filled for: ${names.join(', ')}`);
    }

    for (const rows of couples.values()) {
        const [kept, ...extra] = [...rows].sort((x, y) => Number(isFilled(y)) - Number(isFilled(x)));
        for (const pair of extra) await pairsRepo.remove(conn, pair.id);
        const low = Math.min(kept.card_a_id, kept.card_b_id);
        const high = Math.max(kept.card_a_id, kept.card_b_id);
        if (kept.card_a_id !== low) await pairsRepo.setCards(conn, kept.id, low, high);
    }
};

module.exports = { foldToCombinations };
