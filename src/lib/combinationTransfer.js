'use strict';

const { badRequest } = require('./httpError');

/**
 * Pure JSON format logic for combination decks, matching the prototype's
 * normaliseDeck and pairKey (docs/reference/combinations-prototype.html).
 */

const PAIR_STATES = ['empty', 'drafted', 'done', 'struck'];
const NAME_MAX_LENGTH = 200;
const TEXT_MAX_LENGTH = 5000;
const MAX_CARDS_PER_DECK = 200;
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
    const name = deck.name.trim();
    const limitName = (value, what) => {
        const trimmed = value.trim();
        if (trimmed.length > NAME_MAX_LENGTH) throw fail(`${what} name is over ${NAME_MAX_LENGTH} characters`);
        return trimmed;
    };
    const limitText = (value, what) => {
        const str = text(value);
        if (str.length > TEXT_MAX_LENGTH) throw fail(`${what} is over ${TEXT_MAX_LENGTH} characters`);
        return str;
    };
    limitName(name, 'the deck');
    if (deck.cards.length > MAX_CARDS_PER_DECK) throw fail(`a deck holds at most ${MAX_CARDS_PER_DECK} cards`);

    const ids = new Set();
    const cards = deck.cards.map((card) => {
        if (!isObject(card) || typeof card.id !== 'string' || typeof card.name !== 'string') {
            throw fail('every card needs an id and a name');
        }
        if (card.id.includes(KEY_SEPARATOR) || ids.has(card.id)) {
            throw fail(`card id "${card.id}" is duplicated or contains "${KEY_SEPARATOR}"`);
        }
        ids.add(card.id);
        return { key: card.id, name: limitName(card.name, 'a card'), detail: limitText(card.detail, 'a card detail') };
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
            name: limitName(text(pair.name), 'a pair'),
            effect: limitText(pair.effect, 'a pair effect'),
            notes: limitText(pair.notes, 'pair notes'),
            state: PAIR_STATES.includes(pair.state) ? pair.state : 'empty',
        });
    });

    return { name, cards, pairs: [...byKey.values()] };
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

module.exports = {
    PAIR_STATES,
    NAME_MAX_LENGTH,
    TEXT_MAX_LENGTH,
    MAX_CARDS_PER_DECK,
    parseImport,
    toExportDeck,
};
