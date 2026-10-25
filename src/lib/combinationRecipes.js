'use strict';

const cardsRepo = require('../db/repositories/combinationCardsRepo');
const pairsRepo = require('../db/repositories/combinationPairsRepo');
const { badRequest } = require('./httpError');
const { MAX_CARDS_PER_DECK } = require('./combinationTransfer');

/**
 * Keeps a pair's result text and its crafted card in sync. Callers run these
 * inside `withTransaction`; nothing here opens one.
 */

const findPair = async (conn, deckId, pairId) =>
    (await pairsRepo.listByDeck(conn, deckId)).find((p) => p.id === pairId);

/** The card the typed name should point at: a match, the pair's own crafted card renamed, or a new one. */
const resolveTarget = async (conn, deckId, pair, name) => {
    const match = await cardsRepo.findByName(conn, deckId, name);
    if (match) return match;

    const old = pair.result_card_id ? await cardsRepo.findById(conn, pair.result_card_id) : null;
    if (old?.is_crafted && (await pairsRepo.listByResult(conn, old.id)).length === 1) {
        return cardsRepo.update(conn, old.id, { name });
    }

    if ((await cardsRepo.listByDeck(conn, deckId)).length >= MAX_CARDS_PER_DECK) {
        throw badRequest(`A deck holds at most ${MAX_CARDS_PER_DECK} cards`);
    }
    return cardsRepo.create(conn, { deckId, name, onX: true, onY: true, crafted: true });
};

/** Removes a crafted card nothing makes and no filled pair uses. */
const removeIfOrphaned = async (conn, cardId) => {
    const card = await cardsRepo.findById(conn, cardId);
    if (!card?.is_crafted) return;
    if ((await pairsRepo.listByResult(conn, cardId)).length > 0) return;
    if ((await pairsRepo.countFilledForCard(conn, cardId)) > 0) return;

    await cardsRepo.remove(conn, cardId);
};

const link = async (conn, deckId, pair, name) => {
    const typed = name.trim();
    const target = typed ? await resolveTarget(conn, deckId, pair, typed) : null;

    await pairsRepo.setResult(conn, pair.id, target?.id ?? null);
    await pairsRepo.upsert(conn, deckId, pair.card_a_id, pair.card_b_id, { name: target?.name ?? '' }, { ordered: true });

    const oldId = pair.result_card_id;
    if (oldId && oldId !== target?.id) await removeIfOrphaned(conn, oldId);
};

const applyResult = async (conn, deckId, pairId, name) => {
    const pair = await findPair(conn, deckId, pairId);

    await link(conn, deckId, pair, name);
};

const linkAllResults = async (conn, deckId) => {
    const pairs = await pairsRepo.listByDeck(conn, deckId);

    for (const pair of pairs.filter((p) => p.name.trim())) {
        await link(conn, deckId, pair, pair.name);
    }
};

const unlinkAllResults = async (conn, deckId) => {
    const pairs = await pairsRepo.listByDeck(conn, deckId);

    for (const pair of pairs.filter((p) => p.result_card_id)) {
        await pairsRepo.setResult(conn, pair.id, null);
    }
};

module.exports = { applyResult, linkAllResults, unlinkAllResults };
