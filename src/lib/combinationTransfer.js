'use strict';

const { badRequest } = require('./httpError');

/**
 * Pure JSON format logic for combination decks, matching the prototype's
 * normaliseDeck and pairKey (docs/reference/combinations-prototype.html).
 */

const PAIR_STATES = ['empty', 'drafted', 'done', 'struck'];
const KEY_SEPARATOR = '|';

const pairKey = (a, b) => (a < b ? `${a}${KEY_SEPARATOR}${b}` : `${b}${KEY_SEPARATOR}${a}`);

const text = (value) => (value ? String(value) : '');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const normaliseDeck = (deck, index) => {
    const label = isObject(deck) && typeof deck.name === 'string' ? `"${deck.name}"` : `#${index + 1}`;
    const fail = (reason) => badRequest(`Deck ${label}: ${reason}`);
    if (label.startsWith('#') || !Array.isArray(deck.cards)) {
        throw fail('a deck needs a name and a cards list');
    }

    const ids = new Set();
    const cards = deck.cards.map((card) => {
        if (!isObject(card) || typeof card.id !== 'string' || typeof card.name !== 'string') {
            throw fail('every card needs an id and a name');
        }
        if (card.id.includes(KEY_SEPARATOR) || ids.has(card.id)) {
            throw fail(`card id "${card.id}" is duplicated or contains "${KEY_SEPARATOR}"`);
        }
        ids.add(card.id);
        return { key: card.id, name: card.name, detail: text(card.detail) };
    });

    const byKey = new Map();
    const rawPairs = isObject(deck.pairs) ? deck.pairs : {};
    Object.entries(rawPairs).forEach(([key, pair]) => {
        const [a, b] = key.split(KEY_SEPARATOR);
        if (!ids.has(a) || !ids.has(b) || a === b || !pair) return;
        const [aKey, bKey] = a < b ? [a, b] : [b, a];
        byKey.set(pairKey(a, b), {
            aKey,
            bKey,
            name: text(pair.name),
            effect: text(pair.effect),
            notes: text(pair.notes),
            state: PAIR_STATES.includes(pair.state) ? pair.state : 'empty',
        });
    });

    return { name: deck.name, cards, pairs: [...byKey.values()] };
};

/** Accepts one deck, a list of decks, or `{ decks }`; other app fields are ignored. */
const parseImport = (body) => {
    let decks = [body];
    if (Array.isArray(body)) decks = body;
    else if (isObject(body) && Array.isArray(body.decks)) decks = body.decks;
    return decks.map(normaliseDeck);
};

/** Rows are the repos' raw rows; a pair is listed once it has left the empty state. */
const toExportDeck = (deck, cards, pairs) => {
    const cardId = (id) => `c_${id}`;
    const exported = {};
    pairs
        .filter((pair) => pair.state !== 'empty')
        .forEach((pair) => {
            exported[pairKey(cardId(pair.card_a_id), cardId(pair.card_b_id))] = {
                name: pair.name,
                effect: pair.effect,
                notes: pair.notes,
                state: pair.state,
            };
        });
    return {
        id: `d_${deck.id}`,
        name: deck.name,
        cards: cards.map((card) => ({ id: cardId(card.id), name: card.name, detail: card.detail })),
        pairs: exported,
    };
};

module.exports = { PAIR_STATES, parseImport, toExportDeck };
