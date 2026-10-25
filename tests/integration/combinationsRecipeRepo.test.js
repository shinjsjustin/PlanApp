'use strict';

const decksRepo = require('../../src/db/repositories/combinationDecksRepo');
const cardsRepo = require('../../src/db/repositories/combinationCardsRepo');
const pairsRepo = require('../../src/db/repositories/combinationPairsRepo');
const { toComboCard, toComboDeck, toComboPair } = require('../../src/lib/combinationSerializers');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const setup = async (conn) => {
    const ownerId = await createTestUser(conn);
    const deck = await decksRepo.create(conn, { ownerId, name: 'Recipes' });
    return { ownerId, deck };
};

describe('combinationDecksRepo recipe flag', () => {
    test('create defaults to not a recipe and stores recipe: true', async () => {
        const conn = getConn();
        const { ownerId, deck } = await setup(conn);

        const recipe = await decksRepo.create(conn, { ownerId, name: 'R', recipe: true });

        expect(deck.is_recipe).toBe(0);
        expect(recipe.is_recipe).toBe(1);
    });

    test('update sets and clears recipe, and keeps it when omitted', async () => {
        const conn = getConn();
        const { deck } = await setup(conn);

        const on = await decksRepo.update(conn, deck.id, { recipe: true });
        const renamed = await decksRepo.update(conn, deck.id, { name: 'Other' });
        const off = await decksRepo.update(conn, deck.id, { recipe: false });

        expect([on.is_recipe, renamed.is_recipe, off.is_recipe]).toEqual([1, 1, 0]);
    });

    test('listByOwner rows carry is_recipe', async () => {
        const conn = getConn();
        const { ownerId } = await setup(conn);
        await decksRepo.create(conn, { ownerId, name: 'Zed', recipe: true });

        const rows = await decksRepo.listByOwner(conn, ownerId);

        expect(rows.map((r) => [r.name, r.is_recipe])).toEqual([['Recipes', 0], ['Zed', 1]]);
    });
});

describe('combinationCardsRepo crafted and findByName', () => {
    test('create defaults crafted to off and stores crafted: true', async () => {
        const conn = getConn();
        const { deck } = await setup(conn);

        const plain = await cardsRepo.create(conn, { deckId: deck.id, name: 'p' });
        const crafted = await cardsRepo.create(conn, { deckId: deck.id, name: 'c', crafted: true });

        expect([plain.is_crafted, crafted.is_crafted]).toEqual([0, 1]);
        expect((await cardsRepo.listByDeck(conn, deck.id)).map((c) => c.is_crafted)).toEqual([0, 1]);
    });

    test('findByName ignores case and surrounding spaces, takes the first by position, else null', async () => {
        const conn = getConn();
        const { deck } = await setup(conn);
        const other = await decksRepo.create(conn, { ownerId: deck.owner_id, name: 'Other' });
        await cardsRepo.create(conn, { deckId: other.id, name: 'Stone' });
        const first = await cardsRepo.create(conn, { deckId: deck.id, name: 'Stone' });
        await cardsRepo.create(conn, { deckId: deck.id, name: 'STONE' });

        const found = await cardsRepo.findByName(conn, deck.id, ' stone ');
        const spaced = await cardsRepo.create(conn, { deckId: deck.id, name: '  Iron ' });
        const trimmed = await cardsRepo.findByName(conn, deck.id, 'iron');
        const missing = await cardsRepo.findByName(conn, deck.id, 'wood');

        expect(found.id).toBe(first.id);
        expect(trimmed.id).toBe(spaced.id);
        expect(missing).toBeNull();
    });
});

describe('combinationPairsRepo result card', () => {
    const pairSetup = async (conn) => {
        const { deck } = await setup(conn);
        const a = await cardsRepo.create(conn, { deckId: deck.id, name: 'a' });
        const b = await cardsRepo.create(conn, { deckId: deck.id, name: 'b' });
        const c = await cardsRepo.create(conn, { deckId: deck.id, name: 'c', crafted: true });
        const pair = await pairsRepo.upsert(conn, deck.id, a.id, b.id, { name: 'old' });
        return { deck, a, b, c, pair };
    };

    test('rows start with no result; setResult sets it and null clears it', async () => {
        const conn = getConn();
        const { deck, c, pair } = await pairSetup(conn);

        const set = await pairsRepo.setResult(conn, pair.id, c.id);
        const listed = await pairsRepo.listByDeck(conn, deck.id);
        const cleared = await pairsRepo.setResult(conn, pair.id, null);
        const missing = await pairsRepo.setResult(conn, 987654321, c.id);

        expect(pair.result_card_id).toBeNull();
        expect(set.result_card_id).toBe(c.id);
        expect(listed[0].result_card_id).toBe(c.id);
        expect(cleared.result_card_id).toBeNull();
        expect(missing).toBeNull();
    });

    test('listByResult returns only pairs producing that card', async () => {
        const conn = getConn();
        const { deck, a, c, pair } = await pairSetup(conn);
        const second = await pairsRepo.upsert(conn, deck.id, a.id, c.id, {});
        await pairsRepo.setResult(conn, pair.id, c.id);

        const rows = await pairsRepo.listByResult(conn, c.id);

        expect(rows.map((r) => r.id)).toEqual([pair.id]);
        expect(second.result_card_id).toBeNull();
        expect(await pairsRepo.listByResult(conn, a.id)).toEqual([]);
    });

    test('setNameForResult renames only pairs producing that card', async () => {
        const conn = getConn();
        const { deck, a, c, pair } = await pairSetup(conn);
        const other = await pairsRepo.upsert(conn, deck.id, a.id, c.id, { name: 'keep' });
        await pairsRepo.setResult(conn, pair.id, c.id);

        await pairsRepo.setNameForResult(conn, c.id, 'Sword');

        const byId = Object.fromEntries((await pairsRepo.listByDeck(conn, deck.id)).map((r) => [r.id, r.name]));
        expect(byId).toEqual({ [pair.id]: 'Sword', [other.id]: 'keep' });
    });

    test('deleting the result card clears the result', async () => {
        const conn = getConn();
        const { c, pair } = await pairSetup(conn);
        await pairsRepo.setResult(conn, pair.id, c.id);

        await cardsRepo.remove(conn, c.id);

        expect((await pairsRepo.listByResult(conn, c.id))).toEqual([]);
    });
});

describe('recipe serializers', () => {
    test('turn 0/1 into booleans and a missing result into null', () => {
        const deckRow = { id: 1, name: 'd', pair_mode: 'combinations', project_id: null, source_deck_id: null,
            card_count: 0, drafted_count: 0, done_count: 0, struck_count: 0 };
        const cardRow = { id: 1, deck_id: 1, name: 'c', detail: '', position: 0, on_x: 0, on_y: 0 };
        const pairRow = { id: 1, card_a_id: 1, card_b_id: 2, name: '', effect: '', notes: '', state: 'empty' };

        expect([toComboDeck({ ...deckRow, is_recipe: 1 }).recipe, toComboDeck({ ...deckRow, is_recipe: 0 }).recipe])
            .toEqual([true, false]);
        expect([toComboCard({ ...cardRow, is_crafted: 1 }).crafted, toComboCard({ ...cardRow, is_crafted: 0 }).crafted])
            .toEqual([true, false]);
        expect(toComboPair({ ...pairRow, result_card_id: null }).resultCardId).toBeNull();
        expect(toComboPair({ ...pairRow, result_card_id: 7 }).resultCardId).toBe(7);
    });
});
