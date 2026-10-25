'use strict';

const decksRepo = require('../../src/db/repositories/combinationDecksRepo');
const cardsRepo = require('../../src/db/repositories/combinationCardsRepo');
const pairsRepo = require('../../src/db/repositories/combinationPairsRepo');
const { MAX_CARDS_PER_DECK } = require('../../src/lib/combinationTransfer');
const { applyResult, linkAllResults, unlinkAllResults } = require('../../src/lib/combinationRecipes');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const setup = async (conn) => {
    const ownerId = await createTestUser(conn);
    const deck = await decksRepo.create(conn, { ownerId, name: 'Recipes', recipe: true });
    const card = (name, extra = {}) => cardsRepo.create(conn, { deckId: deck.id, name, ...extra });
    const pair = (a, b, fields = {}) => pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'drafted', ...fields });
    const names = async () => (await cardsRepo.listByDeck(conn, deck.id)).map((c) => c.name);
    const pairRow = async (id) => (await pairsRepo.listByDeck(conn, deck.id)).find((p) => p.id === id);
    return { deck, card, pair, names, pairRow };
};

describe('applyResult', () => {
    test('links a matching card and copies its name onto the pair', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow } = await setup(conn);
        const wood = await card('Wood');
        const stone = await card('Stone');
        const p = await pair(wood, stone);

        await applyResult(conn, deck.id, p.id, ' stone ');

        const row = await pairRow(p.id);
        expect([row.result_card_id, row.name]).toEqual([stone.id, 'Stone']);
    });

    test('creates a crafted card on both axes when nothing matches', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow } = await setup(conn);
        const p = await pair(await card('Wood'), await card('Stone'));

        await applyResult(conn, deck.id, p.id, 'Plank');

        const row = await pairRow(p.id);
        const made = await cardsRepo.findById(conn, row.result_card_id);
        expect([made.name, made.is_crafted, made.on_x, made.on_y, made.position]).toEqual(['Plank', 1, 1, 1, 2]);
        expect(row.name).toBe('Plank');
    });

    test('renames the crafted old result when only this pair makes it', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow, names } = await setup(conn);
        const p = await pair(await card('Wood'), await card('Stone'));
        await applyResult(conn, deck.id, p.id, 'Plank');
        const first = (await pairRow(p.id)).result_card_id;

        await applyResult(conn, deck.id, p.id, 'Board');

        const row = await pairRow(p.id);
        expect(row.result_card_id).toBe(first);
        expect(row.name).toBe('Board');
        expect(await names()).toEqual(['Wood', 'Stone', 'Board']);
    });

    test('creates a new card instead of renaming one that two pairs make', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow, names } = await setup(conn);
        const [wood, stone, iron] = [await card('Wood'), await card('Stone'), await card('Iron')];
        const p1 = await pair(wood, stone);
        const p2 = await pair(wood, iron);
        await applyResult(conn, deck.id, p1.id, 'Plank');
        await applyResult(conn, deck.id, p2.id, 'Plank');

        await applyResult(conn, deck.id, p1.id, 'Board');

        const [r1, r2] = [await pairRow(p1.id), await pairRow(p2.id)];
        expect(r1.result_card_id).not.toBe(r2.result_card_id);
        expect([r1.name, r2.name]).toEqual(['Board', 'Plank']);
        expect(await names()).toEqual(['Wood', 'Stone', 'Iron', 'Plank', 'Board']);
    });

    test('blank unlinks, keeps the name empty and removes the unused crafted card', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow, names } = await setup(conn);
        const p = await pair(await card('Wood'), await card('Stone'));
        await applyResult(conn, deck.id, p.id, 'Plank');

        await applyResult(conn, deck.id, p.id, '   ');

        const row = await pairRow(p.id);
        expect([row.result_card_id, row.name]).toEqual([null, '']);
        expect(await names()).toEqual(['Wood', 'Stone']);
    });

    test('keeps a crafted card while another pair still makes it', async () => {
        const conn = getConn();
        const { deck, card, pair, names } = await setup(conn);
        const [wood, stone, iron] = [await card('Wood'), await card('Stone'), await card('Iron')];
        const p1 = await pair(wood, stone);
        const p2 = await pair(wood, iron);
        await applyResult(conn, deck.id, p1.id, 'Plank');
        await applyResult(conn, deck.id, p2.id, 'Plank');

        await applyResult(conn, deck.id, p1.id, '');

        expect(await names()).toContain('Plank');
    });

    test('keeps a crafted card while a filled pair uses it, and closes position gaps when removed', async () => {
        const conn = getConn();
        const { deck, card, pair } = await setup(conn);
        const [wood, stone] = [await card('Wood'), await card('Stone')];
        const p = await pair(wood, stone);
        await applyResult(conn, deck.id, p.id, 'Plank');
        const plank = await cardsRepo.findByName(conn, deck.id, 'Plank');
        const user = await pair(plank, wood);
        await card('Last');

        await applyResult(conn, deck.id, p.id, '');
        expect(await cardsRepo.findByName(conn, deck.id, 'Plank')).not.toBeNull();

        await pairsRepo.upsert(conn, deck.id, plank.id, wood.id, { state: 'empty' });
        await applyResult(conn, deck.id, p.id, 'Plank2');
        await applyResult(conn, deck.id, p.id, '');
        const cards = await cardsRepo.listByDeck(conn, deck.id);
        expect(user.id).toBeDefined();
        expect(cards.map((c) => [c.name, c.position])).toEqual([['Wood', 0], ['Stone', 1], ['Plank', 2], ['Last', 3]]);
    });

    test('never renames or removes a hand-added card: Wood then Wooden', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow, names } = await setup(conn);
        const p = await pair(await card('Stone'), await card('Iron'));
        await card('Wood');

        await applyResult(conn, deck.id, p.id, 'Wood');
        await applyResult(conn, deck.id, p.id, 'Wooden');

        expect(await names()).toEqual(['Stone', 'Iron', 'Wood', 'Wooden']);
        expect((await pairRow(p.id)).name).toBe('Wooden');

        await applyResult(conn, deck.id, p.id, 'Wood');
        await applyResult(conn, deck.id, p.id, '');
        expect(await names()).toContain('Wood');
    });

    test('Stone + Stone = Stone links the existing Stone', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow, names } = await setup(conn);
        const stone = await card('Stone');
        const p = await pair(stone, stone);

        await applyResult(conn, deck.id, p.id, 'Stone');

        expect((await pairRow(p.id)).result_card_id).toBe(stone.id);
        expect(await names()).toEqual(['Stone']);
    });

    test('throws badRequest at the card limit and leaves the deck unchanged', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow } = await setup(conn);
        const [a, b] = [await card('A'), await card('B')];
        for (let i = 2; i < MAX_CARDS_PER_DECK; i += 1) await card(`c${i}`);
        const p = await pair(a, b);

        await expect(applyResult(conn, deck.id, p.id, 'New')).rejects.toMatchObject({ status: 400 });

        expect(await cardsRepo.listByDeck(conn, deck.id)).toHaveLength(MAX_CARDS_PER_DECK);
        expect((await pairRow(p.id)).result_card_id).toBeNull();
    });
});

describe('linkAllResults and unlinkAllResults', () => {
    test('links every pair with a name, skips blank ones, then unlink clears links only', async () => {
        const conn = getConn();
        const { deck, card, pair, pairRow, names } = await setup(conn);
        const [wood, stone, iron] = [await card('Wood'), await card('Stone'), await card('Iron')];
        const p1 = await pair(wood, stone, { name: 'Plank' });
        const p2 = await pair(wood, iron, { name: 'stone' });
        const p3 = await pair(stone, iron);

        await linkAllResults(conn, deck.id);

        const [r1, r2, r3] = [await pairRow(p1.id), await pairRow(p2.id), await pairRow(p3.id)];
        expect(r1.result_card_id).not.toBeNull();
        expect([r2.result_card_id, r2.name]).toEqual([stone.id, 'Stone']);
        expect(r3.result_card_id).toBeNull();
        expect(await names()).toEqual(['Wood', 'Stone', 'Iron', 'Plank']);

        await unlinkAllResults(conn, deck.id);

        const after = await pairsRepo.listByDeck(conn, deck.id);
        expect(after.map((p) => p.result_card_id)).toEqual([null, null, null]);
        expect(after.map((p) => p.name).sort()).toEqual(['', 'Plank', 'Stone']);
        expect(await names()).toEqual(['Wood', 'Stone', 'Iron', 'Plank']);
    });
});
