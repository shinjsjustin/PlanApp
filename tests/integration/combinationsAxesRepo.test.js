'use strict';

const decksRepo = require('../../src/db/repositories/combinationDecksRepo');
const cardsRepo = require('../../src/db/repositories/combinationCardsRepo');
const pairsRepo = require('../../src/db/repositories/combinationPairsRepo');
const { toComboCard, toComboDeck } = require('../../src/lib/combinationSerializers');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const setup = async (conn) => {
    const ownerId = await createTestUser(conn);
    const deck = await decksRepo.create(conn, { ownerId, name: 'Axes' });
    const a = await cardsRepo.create(conn, { deckId: deck.id, name: 'a' });
    const b = await cardsRepo.create(conn, { deckId: deck.id, name: 'b' });
    return { ownerId, deck, a, b };
};

describe('combinationCardsRepo axes', () => {
    test('create defaults both axes to off and stores given values', async () => {
        const conn = getConn();
        const { deck, a } = await setup(conn);

        const both = await cardsRepo.create(conn, { deckId: deck.id, name: 'x', onX: true, onY: true });
        const onlyY = await cardsRepo.create(conn, { deckId: deck.id, name: 'y', onY: true });

        expect(a).toMatchObject({ on_x: 0, on_y: 0 });
        expect(both).toMatchObject({ on_x: 1, on_y: 1 });
        expect(onlyY).toMatchObject({ on_x: 0, on_y: 1 });
    });

    test('update changes axes, can turn them off, and keeps omitted ones', async () => {
        const conn = getConn();
        const { deck } = await setup(conn);
        const card = await cardsRepo.create(conn, { deckId: deck.id, name: 'c', onX: true, onY: true });

        const afterX = await cardsRepo.update(conn, card.id, { onX: false });
        expect(afterX).toMatchObject({ on_x: 0, on_y: 1, name: 'c' });

        const afterY = await cardsRepo.update(conn, card.id, { onY: false, name: 'd' });
        expect(afterY).toMatchObject({ on_x: 0, on_y: 0, name: 'd' });

        const afterOn = await cardsRepo.update(conn, card.id, { onX: true });
        expect(afterOn).toMatchObject({ on_x: 1, on_y: 0 });
    });

    test('listByDeck and findById rows carry the axes', async () => {
        const conn = getConn();
        const { deck } = await setup(conn);
        const card = await cardsRepo.create(conn, { deckId: deck.id, name: 'c', onX: true });

        expect(await cardsRepo.findById(conn, card.id)).toMatchObject({ on_x: 1, on_y: 0 });
        const listed = await cardsRepo.listByDeck(conn, deck.id);
        expect(listed.find((r) => r.id === card.id)).toMatchObject({ on_x: 1, on_y: 0 });
    });
});

describe('combinationDecksRepo mode', () => {
    test('create defaults to combinations and stores a given mode', async () => {
        const conn = getConn();
        const { ownerId, deck } = await setup(conn);

        const perm = await decksRepo.create(conn, { ownerId, name: 'Perm', mode: 'permutations' });

        expect(deck.pair_mode).toBe('combinations');
        expect(perm.pair_mode).toBe('permutations');
    });

    test('update changes mode and keeps it when omitted', async () => {
        const conn = getConn();
        const { deck } = await setup(conn);

        const changed = await decksRepo.update(conn, deck.id, { mode: 'permutations' });
        const renamed = await decksRepo.update(conn, deck.id, { name: 'Renamed' });

        expect(changed.pair_mode).toBe('permutations');
        expect(renamed).toMatchObject({ pair_mode: 'permutations', name: 'Renamed' });
    });

    test('listByOwner rows carry pair_mode', async () => {
        const conn = getConn();
        const { ownerId, deck } = await setup(conn);
        await decksRepo.update(conn, deck.id, { mode: 'permutations' });

        const rows = await decksRepo.listByOwner(conn, ownerId, {});

        expect(rows.find((r) => r.id === deck.id).pair_mode).toBe('permutations');
    });
});

describe('combinationPairsRepo ordered and edit', () => {
    test('ordered upsert of (B, A) then (A, B) makes two rows', async () => {
        const conn = getConn();
        const { deck, a, b } = await setup(conn);

        const ba = await pairsRepo.upsert(conn, deck.id, b.id, a.id, { name: 'ba' }, { ordered: true });
        const ab = await pairsRepo.upsert(conn, deck.id, a.id, b.id, { name: 'ab' }, { ordered: true });

        expect(ba).toMatchObject({ card_a_id: b.id, card_b_id: a.id, name: 'ba' });
        expect(ab).toMatchObject({ card_a_id: a.id, card_b_id: b.id, name: 'ab' });
        expect(ba.id).not.toBe(ab.id);
        expect(await pairsRepo.listByDeck(conn, deck.id)).toHaveLength(2);
    });

    test('ordered upsert of the same order twice updates one row', async () => {
        const conn = getConn();
        const { deck, a, b } = await setup(conn);

        await pairsRepo.upsert(conn, deck.id, b.id, a.id, { name: 'one' }, { ordered: true });
        const again = await pairsRepo.upsert(conn, deck.id, b.id, a.id, { effect: 'e' }, { ordered: true });

        expect(again).toMatchObject({ name: 'one', effect: 'e' });
        expect(await pairsRepo.listByDeck(conn, deck.id)).toHaveLength(1);
    });

    test('unordered upsert of (B, A) updates the (A, B) row', async () => {
        const conn = getConn();
        const { deck, a, b } = await setup(conn);
        const first = await pairsRepo.upsert(conn, deck.id, a.id, b.id, { name: 'ab' });

        const second = await pairsRepo.upsert(conn, deck.id, b.id, a.id, { effect: 'e' }, { ordered: false });
        const third = await pairsRepo.upsert(conn, deck.id, b.id, a.id, { notes: 'n' });

        expect(second.id).toBe(first.id);
        expect(third).toMatchObject({ id: first.id, card_a_id: a.id, card_b_id: b.id, name: 'ab', effect: 'e', notes: 'n' });
        expect(await pairsRepo.listByDeck(conn, deck.id)).toHaveLength(1);
    });

    test('remove deletes the pair and reports whether one existed', async () => {
        const conn = getConn();
        const { deck, a, b } = await setup(conn);
        const pair = await pairsRepo.upsert(conn, deck.id, a.id, b.id, {});

        expect(await pairsRepo.remove(conn, pair.id)).toBe(true);
        expect(await pairsRepo.remove(conn, pair.id)).toBe(false);
        expect(await pairsRepo.listByDeck(conn, deck.id)).toHaveLength(0);
    });

    test('setCards rewrites the card ids as given and returns the row', async () => {
        const conn = getConn();
        const { deck, a, b } = await setup(conn);
        const pair = await pairsRepo.upsert(conn, deck.id, a.id, b.id, { name: 'p' });

        const flipped = await pairsRepo.setCards(conn, pair.id, b.id, a.id);

        expect(flipped).toMatchObject({ id: pair.id, card_a_id: b.id, card_b_id: a.id, name: 'p' });
        expect(await pairsRepo.setCards(conn, 987654321, a.id, b.id)).toBeNull();
    });
});

describe('serializers', () => {
    const cardRow = { id: 1, deck_id: 2, name: 'n', detail: 'd', position: 0, on_x: 1, on_y: 0 };

    test('toComboCard turns 0/1 into booleans', () => {
        expect(toComboCard(cardRow)).toMatchObject({ onX: true, onY: false });
        expect(toComboCard({ ...cardRow, on_x: 0, on_y: 1 })).toMatchObject({ onX: false, onY: true });
    });

    test('toComboDeck carries mode from pair_mode', () => {
        const row = {
            id: 1, name: 'n', project_id: null, source_deck_id: null, pair_mode: 'permutations',
            card_count: 0, drafted_count: 0, done_count: 0, struck_count: 0,
        };
        expect(toComboDeck(row).mode).toBe('permutations');
    });
});
