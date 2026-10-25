'use strict';

const { parseImport, toExportDeck } = require('../../src/lib/combinationTransfer');

const recipeBody = () => ({
    name: 'Crafting',
    recipe: true,
    cards: [
        { id: 'wood', name: 'Wood', kind: 'base' },
        { id: 'plank', name: 'Plank', detail: 'flat', kind: 'crafted' },
        { id: 'odd', name: 'Odd', kind: 'weird' },
    ],
    pairs: {
        'wood|wood': { name: 'Plank', state: 'done', result: 'plank' },
        'odd|wood': { name: 'Nothing', state: 'drafted', result: 'ghost' },
    },
});

describe('normaliseDeck recipe fields', () => {
    test('reads recipe, card kind and pair result, keeping same-item keys', () => {
        const [deck] = parseImport(recipeBody());

        expect(deck.recipe).toBe(true);
        expect(deck.cards.map((c) => [c.key, c.kind])).toEqual([
            ['wood', 'base'],
            ['plank', 'crafted'],
            ['odd', 'base'],
        ]);
        expect(deck.pairs.map((p) => [p.aKey, p.bKey, p.resultKey])).toEqual([
            ['wood', 'wood', 'plank'],
            ['odd', 'wood', null],
        ]);
    });

    test('drops a same-item key in a deck that is not a recipe deck', () => {
        const body = { ...recipeBody(), recipe: undefined };

        const [deck] = parseImport(body);

        expect(deck).not.toHaveProperty('recipe');
        expect(deck.pairs.map((p) => [p.aKey, p.bKey])).toEqual([['odd', 'wood']]);
        expect(deck.pairs[0]).not.toHaveProperty('resultKey');
    });
});

describe('toExportDeck recipe fields', () => {
    const deck = { id: 5, name: 'Crafting', pair_mode: 'combinations', is_recipe: 1 };
    const cards = [
        { id: 1, name: 'Wood', detail: '', on_x: 1, on_y: 1 },
        { id: 2, name: 'Stone', detail: 's', on_x: 1, on_y: 1 },
        { id: 3, name: 'Plank', detail: 'p', on_x: 1, on_y: 1, is_crafted: 1 },
        { id: 4, name: 'Ghost', detail: '', on_x: 1, on_y: 1 },
    ];
    const pair = (a, b, state, result, name = '') => ({
        card_a_id: a, card_b_id: b, state, result_card_id: result, name, effect: '', notes: '',
    });
    const pairs = [
        pair(1, 1, 'done', 3, 'Plank'),
        pair(1, 2, 'empty', null),
        pair(2, 3, 'struck', 4, 'Ghost'),
        pair(1, 3, 'drafted', null),
    ];

    test('adds recipe, kinds, results, items and recipes', () => {
        const out = toExportDeck(deck, cards, pairs);

        expect(out.recipe).toBe(true);
        expect(out.cards.map((c) => [c.id, c.kind])).toEqual([
            ['c_1', 'base'], ['c_2', 'base'], ['c_3', 'crafted'], ['c_4', 'base'],
        ]);
        expect(out.pairs['c_1|c_1'].result).toBe('c_3');
        expect(out.pairs['c_2|c_3'].result).toBe('c_4');
        expect(out.pairs['c_1|c_3'].result).toBeNull();
        expect(out.items).toEqual([
            { id: 'c_1', name: 'Wood', detail: '', kind: 'base' },
            { id: 'c_2', name: 'Stone', detail: 's', kind: 'base' },
            { id: 'c_3', name: 'Plank', detail: 'p', kind: 'crafted' },
            { id: 'c_4', name: 'Ghost', detail: '', kind: 'base' },
        ]);
        expect(out.recipes).toEqual([{ ingredients: ['c_1', 'c_1'], result: 'c_3' }]);
    });

    test('marks a hand-added base card a recipe makes base on cards and crafted on items', () => {
        const stone = { id: 2, name: 'Stone', detail: '', on_x: 1, on_y: 1, is_crafted: 0 };

        const out = toExportDeck(deck, [stone], [pair(2, 2, 'done', 2, 'Stone')]);

        expect(out.cards.map((c) => c.kind)).toEqual(['base']);
        expect(out.items.map((i) => i.kind)).toEqual(['crafted']);
    });

    test('lists an empty pair that has a result so the recipe survives', () => {
        const out = toExportDeck(deck, cards, [pair(1, 2, 'empty', 3, 'Plank')]);

        expect(Object.keys(out.pairs)).toEqual(['c_1|c_2']);
        expect(out.recipes).toEqual([{ ingredients: ['c_1', 'c_2'], result: 'c_3' }]);
    });

    test('exports a non-recipe deck with no recipe fields', () => {
        const out = toExportDeck({ ...deck, is_recipe: 0 }, cards, pairs);

        expect(Object.keys(out)).toEqual(['id', 'name', 'mode', 'cards', 'pairs']);
        expect(out.cards[0]).not.toHaveProperty('kind');
        expect(out.pairs['c_1|c_3']).not.toHaveProperty('result');
    });
});
