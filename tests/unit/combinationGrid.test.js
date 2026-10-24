'use strict';

const { isPairVisible } = require('../../src/lib/combinationGrid');

const card = (id, onX, onY) => [id, { id, on_x: onX, on_y: onY }];
const cardsById = new Map([
    card(1, 1, 0), // X only
    card(2, 0, 1), // Y only
    card(3, 1, 1), // both
    card(4, 0, 0), // neither
]);
const pair = (a, b) => ({ card_a_id: a, card_b_id: b });

describe('isPairVisible', () => {
    it.each([
        ['one card on X and the other on Y', 1, 2, true],
        ['the same couple stored the other way', 2, 1, true],
        ['both cards only on X', 1, 1, false],
        ['a card on both axes with an X-only card', 3, 1, true],
        ['a card on neither axis', 4, 3, false],
    ])('combinations: %s', (_label, a, b, expected) => {
        expect(isPairVisible(pair(a, b), cardsById, 'combinations')).toBe(expected);
    });

    it.each([
        ['card A on Y and card B on X', 2, 1, true],
        ['card A on X only and card B on Y only', 1, 2, false],
        ['both on both axes', 3, 3, true],
        ['card A off the Y axis', 1, 3, false],
        ['card B off the X axis', 3, 2, false],
    ])('permutations: %s', (_label, a, b, expected) => {
        expect(isPairVisible(pair(a, b), cardsById, 'permutations')).toBe(expected);
    });
});
