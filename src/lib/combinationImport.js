'use strict';

const decksRepo = require('../db/repositories/combinationDecksRepo');
const cardsRepo = require('../db/repositories/combinationCardsRepo');
const pairsRepo = require('../db/repositories/combinationPairsRepo');
const { badRequest } = require('./httpError');
const { isPairVisible } = require('./combinationGrid');

/**
 * Writes imported or promoted decks. Callers run these inside `withTransaction`
 * so a failure part-way leaves nothing behind.
 */

const NAME_MAX_LENGTH = 200;

const assertFits = (value, what) => {
    if (value.length > NAME_MAX_LENGTH) {
        throw badRequest(`${what} "${value.slice(0, 20)}…" is over ${NAME_MAX_LENGTH} characters`);
    }
};

/** `base`, or `base (2)`, `base (3)`… for the first one the owner has not used. */
const uniqueName = async (conn, ownerId, base) => {
    for (let n = 1; ; n += 1) {
        const suffix = n === 1 ? '' : ` (${n})`;
        const name = base.slice(0, NAME_MAX_LENGTH - suffix.length) + suffix;
        if (!(await decksRepo.nameTaken(conn, ownerId, name))) return name;
    }
};

/** Cards keep their order; each pair is mapped through the card keys to the new ids. */
const importDeck = async (conn, ownerId, parsed) => {
    assertFits(parsed.name, 'Deck name');
    const deck = await decksRepo.create(conn, {
        ownerId,
        name: await uniqueName(conn, ownerId, parsed.name),
        mode: parsed.mode,
    });
    const ordered = parsed.mode === 'permutations';

    const idByKey = new Map();
    for (const card of parsed.cards) {
        assertFits(card.name, 'Card name');
        const created = await cardsRepo.create(conn, {
            deckId: deck.id,
            name: card.name,
            detail: card.detail,
            onX: card.onX,
            onY: card.onY,
        });
        idByKey.set(card.key, created.id);
    }
    for (const pair of parsed.pairs) {
        assertFits(pair.name, 'Pair name');
        const { aKey, bKey, ...fields } = pair;
        await pairsRepo.upsert(conn, deck.id, idByKey.get(aKey), idByKey.get(bKey), fields, { ordered });
    }

    return deck;
};

/** Creates one new deck per parsed deck, in order. Returns the deck rows. */
const importDecks = async (conn, ownerId, parsedDecks) => {
    if (parsedDecks.length === 0) throw badRequest('The import has no decks');
    const created = [];
    for (const parsed of parsedDecks) {
        created.push(await importDeck(conn, ownerId, parsed));
    }

    return created;
};

/**
 * A new combinations deck with a card for each visible done pair, in grid order
 * (first card's position, then second's). Its cards sit on both axes.
 */
const promoteDeck = async (conn, ownerId, deckId) => {
    const source = await decksRepo.findById(conn, deckId);
    const cards = await cardsRepo.listByDeck(conn, deckId);
    const positionById = new Map(cards.map((card) => [card.id, card.position]));
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const nameById = new Map(cards.map((card) => [card.id, card.name]));
    const done = (await pairsRepo.listByDeck(conn, deckId))
        .filter((pair) => pair.state === 'done' && isPairVisible(pair, cardById, source.pair_mode))
        .map((pair) => {
            const [first, second] = [pair.card_a_id, pair.card_b_id].sort(
                (x, y) => positionById.get(x) - positionById.get(y)
            );
            return { pair, first, second };
        })
        .sort(
            (x, y) =>
                positionById.get(x.first) - positionById.get(y.first) ||
                positionById.get(x.second) - positionById.get(y.second)
        );

    const deck = await decksRepo.create(conn, {
        ownerId,
        name: await uniqueName(conn, ownerId, `${source.name} · done pairs`),
        projectId: source.project_id,
        sourceDeckId: source.id,
    });
    for (const { pair, first, second } of done) {
        await cardsRepo.create(conn, {
            deckId: deck.id,
            name: pair.name || `${nameById.get(first)} + ${nameById.get(second)}`,
            detail: pair.effect,
            onX: true,
            onY: true,
        });
    }

    return deck;
};

module.exports = { importDecks, promoteDeck };
