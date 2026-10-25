'use strict';

const request = require('supertest');

const app = require('../../src/server');
const cardsRepo = require('../../src/db/repositories/combinationCardsRepo');
const pairsRepo = require('../../src/db/repositories/combinationPairsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId, method, path) =>
    request(app)[method](`/api/combinations${path}`).set('Authorization', authHeaderFor(userId));

const recipeDeck = {
    id: 'd1',
    name: 'Crafting',
    recipe: true,
    cards: [
        { id: 'wood', name: 'Wood', kind: 'base' },
        { id: 'stone', name: 'Stone', kind: 'base' },
        { id: 'plank', name: 'Plank', detail: 'flat', kind: 'crafted' },
    ],
    pairs: {
        'wood|wood': { name: 'Plank', state: 'done', result: 'plank' },
        'stone|wood': { name: 'Handle', state: 'drafted' },
        'stone|stone': { name: 'Wood', state: 'struck' },
    },
};

const importOne = async (ownerId, body) => {
    const res = await as(ownerId, 'post', '/import').send(body);
    expect(res.status).toBe(201);
    return res.body.data.decks[0];
};

const withoutIds = (exported) => ({
    items: exported.items.map(({ id, ...rest }) => rest),
    names: new Map(exported.items.map((i) => [i.id, i.name])),
    recipes: exported.recipes,
});

const recipesByName = (exported) => {
    const names = new Map(exported.items.map((i) => [i.id, i.name]));
    return exported.recipes.map((r) => [r.ingredients.map((i) => names.get(i)), names.get(r.result)]);
};

describe('recipe deck import', () => {
    test('makes a recipe deck keeping same-item keys and crafted cards', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const deck = await importOne(ownerId, recipeDeck);

        const cards = await cardsRepo.listByDeck(conn, deck.id);
        expect(cards.map((c) => [c.name, c.is_crafted])).toEqual([['Wood', 0], ['Stone', 0], ['Plank', 1], ['Handle', 1]]);
        const [wood, stone, plank] = cards;
        const pairs = await pairsRepo.listByDeck(conn, deck.id);
        expect(pairs.map((p) => [p.card_a_id, p.card_b_id])).toEqual(
            expect.arrayContaining([[wood.id, wood.id], [stone.id, stone.id], [wood.id, stone.id]])
        );
        const woodWood = pairs.find((p) => p.card_a_id === wood.id && p.card_b_id === wood.id);
        expect(woodWood.result_card_id).toBe(plank.id);
        const exported = (await as(ownerId, 'get', `/decks/${deck.id}/export`)).body.data;
        expect(exported.recipe).toBe(true);
    });

    test('links a pair without a result key to the card its name matches', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const deck = await importOne(ownerId, recipeDeck);

        const cards = await cardsRepo.listByDeck(conn, deck.id);
        const pairs = await pairsRepo.listByDeck(conn, deck.id);
        const struck = pairs.find((p) => p.card_a_id === cards[1].id && p.card_b_id === cards[1].id);
        expect(struck.result_card_id).toBe(cards[0].id);
        const handle = pairs.find((p) => p.name === 'Handle');
        const handleCard = cards.find((c) => c.name === 'Handle');
        expect([handleCard.is_crafted, handle.result_card_id]).toEqual([1, handleCard.id]);
    });

    test('does not let a result name override an explicit result key', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const body = {
            ...recipeDeck,
            pairs: { 'wood|wood': { name: 'Stone', state: 'done', result: 'plank' } },
        };

        const deck = await importOne(ownerId, body);

        const cards = await cardsRepo.listByDeck(conn, deck.id);
        const [pair] = await pairsRepo.listByDeck(conn, deck.id);
        expect(pair.result_card_id).toBe(cards.find((c) => c.name === 'Plank').id);
        expect(cards).toHaveLength(3);
    });

    test('ignores same-item keys when recipe is not set', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const deck = await importOne(ownerId, { ...recipeDeck, recipe: undefined });

        const pairs = await pairsRepo.listByDeck(conn, deck.id);
        expect(pairs).toHaveLength(1);
    });
});

describe('recipe deck export', () => {
    test('exports kinds, results, items and recipes in c_ ids', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await importOne(ownerId, recipeDeck);

        const res = await as(ownerId, 'get', `/decks/${deck.id}/export`);

        const out = res.body.data;
        expect(out).toMatchObject({ id: `d_${deck.id}`, name: 'Crafting', mode: 'combinations', recipe: true });
        expect(out.cards.map((c) => [c.name, c.kind])).toEqual([
            ['Wood', 'base'], ['Stone', 'base'], ['Plank', 'crafted'], ['Handle', 'crafted'],
        ]);
        expect(recipesByName(out)).toEqual(
            expect.arrayContaining([[['Wood', 'Wood'], 'Plank'], [['Wood', 'Stone'], 'Handle']])
        );
        expect(out.recipes).toHaveLength(2);
        expect(out.items.every((i) => /^c_\d+$/.test(i.id))).toBe(true);
    });

    test('round-trips: export, import, export give the same items and recipes', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const first = await importOne(ownerId, recipeDeck);
        const one = (await as(ownerId, 'get', `/decks/${first.id}/export`)).body.data;

        const second = await importOne(ownerId, one);
        const two = (await as(ownerId, 'get', `/decks/${second.id}/export`)).body.data;

        expect(withoutIds(two).items).toEqual(withoutIds(one).items);
        expect(recipesByName(two)).toEqual(recipesByName(one));
        expect(two.cards.map((c) => [c.name, c.kind])).toEqual(one.cards.map((c) => [c.name, c.kind]));
    });

    test('keeps a hand-added Stone made by Stone + Stone base through a round trip and rename', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const body = {
            name: 'Loop',
            recipe: true,
            cards: [{ id: 'stone', name: 'Stone', kind: 'base' }],
            pairs: { 'stone|stone': { name: 'Stone', state: 'done', result: 'stone' } },
        };
        const first = await importOne(ownerId, body);
        const one = (await as(ownerId, 'get', `/decks/${first.id}/export`)).body.data;
        expect(one.cards.map((c) => c.kind)).toEqual(['base']);

        const second = await importOne(ownerId, one);

        const [stone] = await cardsRepo.listByDeck(conn, second.id);
        expect(stone.is_crafted).toBe(0);
        const renamed = await as(ownerId, 'put', `/decks/${second.id}/pairs`)
            .send({ cardAId: stone.id, cardBId: stone.id, name: 'Gravel' });
        expect(renamed.status).toBe(200);
        const cards = await cardsRepo.listByDeck(conn, second.id);
        expect(cards.find((c) => c.id === stone.id)).toMatchObject({ name: 'Stone', is_crafted: 0 });
    });

    test('exports a deck that is not a recipe deck without recipe fields', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await importOne(ownerId, { name: 'Plain', cards: [{ id: 'a', name: 'A' }], pairs: {} });

        const out = (await as(ownerId, 'get', `/decks/${deck.id}/export`)).body.data;

        expect(Object.keys(out)).toEqual(['id', 'name', 'mode', 'cards', 'pairs']);
    });
});
