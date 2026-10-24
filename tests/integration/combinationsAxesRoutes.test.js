'use strict';

const request = require('supertest');

const app = require('../../src/server');
const decksRepo = require('../../src/db/repositories/combinationDecksRepo');
const cardsRepo = require('../../src/db/repositories/combinationCardsRepo');
const pairsRepo = require('../../src/db/repositories/combinationPairsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId, method, path) =>
    request(app)[method](`/api/combinations${path}`).set('Authorization', authHeaderFor(userId));

const setup = async (mode = 'combinations') => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const deck = await decksRepo.create(conn, { ownerId, name: 'Spells', mode });
    const a = await cardsRepo.create(conn, { deckId: deck.id, name: 'A' });
    const b = await cardsRepo.create(conn, { deckId: deck.id, name: 'B' });
    const c = await cardsRepo.create(conn, { deckId: deck.id, name: 'C' });
    const d = await cardsRepo.create(conn, { deckId: deck.id, name: 'D' });
    return { conn, ownerId, deck, a, b, c, d };
};

const rows = async (conn, deckId) =>
    (await pairsRepo.listByDeck(conn, deckId)).map((p) => [p.card_a_id, p.card_b_id, p.effect]);

describe('card axes', () => {
    test('a new card answers onX false and onY false', async () => {
        const { ownerId, deck } = await setup();

        const res = await as(ownerId, 'post', `/decks/${deck.id}/cards`).send({ name: 'N' });

        expect(res.body.data).toMatchObject({ onX: false, onY: false });
    });

    test('PATCH /cards/:id sets onX and onY alone and with name', async () => {
        const { ownerId, a } = await setup();

        const alone = await as(ownerId, 'patch', `/cards/${a.id}`).send({ onX: true });
        const both = await as(ownerId, 'patch', `/cards/${a.id}`).send({ onY: true, name: 'A2' });
        const bad = await as(ownerId, 'patch', `/cards/${a.id}`).send({ onX: 'yes' });

        expect(alone.body.data).toMatchObject({ name: 'A', onX: true, onY: false });
        expect(both.body.data).toMatchObject({ name: 'A2', onX: true, onY: true });
        expect(bad.status).toBe(400);
    });
});

describe('mode flip', () => {
    test('PATCH /decks/:id sets mode and a flip to permutations changes no pair rows', async () => {
        const { conn, ownerId, deck, a, b } = await setup();
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { effect: 'E', state: 'done' }, { ordered: true });

        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ mode: 'permutations' });

        expect(res.status).toBe(200);
        expect(res.body.data.mode).toBe('permutations');
        expect(await rows(conn, deck.id)).toEqual([[a.id, b.id, 'E']]);
    });

    test('rejects an unknown mode', async () => {
        const { ownerId, deck } = await setup();

        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ mode: 'sideways' });

        expect(res.status).toBe(400);
    });

    test('PUT pairs keeps A+B and B+A apart in permutations and sorts in combinations', async () => {
        const perm = await setup('permutations');
        await as(perm.ownerId, 'put', `/decks/${perm.deck.id}/pairs`).send({ cardAId: perm.b.id, cardBId: perm.a.id, effect: 'BA' });
        const second = await as(perm.ownerId, 'put', `/decks/${perm.deck.id}/pairs`).send({ cardAId: perm.a.id, cardBId: perm.b.id, effect: 'AB' });

        expect(second.body.data).toMatchObject({ cardAId: perm.a.id, cardBId: perm.b.id });
        expect(await rows(perm.conn, perm.deck.id)).toEqual([
            [perm.a.id, perm.b.id, 'AB'],
            [perm.b.id, perm.a.id, 'BA'],
        ]);

        const combo = await setup();
        const res = await as(combo.ownerId, 'put', `/decks/${combo.deck.id}/pairs`).send({ cardAId: combo.b.id, cardBId: combo.a.id, effect: 'x' });

        expect(res.body.data).toMatchObject({ cardAId: combo.a.id, cardBId: combo.b.id });
    });

    test('flip back with both orders filled is 409 naming every clash and changes nothing', async () => {
        const { conn, ownerId, deck, a, b, c, d } = await setup('permutations');
        for (const [x, y] of [[a, b], [b, a], [c, d], [d, c]]) {
            await pairsRepo.upsert(conn, deck.id, x.id, y.id, { effect: `${x.name}${y.name}`, state: 'drafted' }, { ordered: true });
        }
        const before = await rows(conn, deck.id);

        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ mode: 'combinations' });

        expect(res.status).toBe(409);
        expect(res.body.error.message ?? res.body.error).toContain('Both orders are filled for: A + B, C + D');
        expect(await rows(conn, deck.id)).toEqual(before);
        expect((await decksRepo.findById(conn, deck.id)).pair_mode).toBe('permutations');
    });

    test('flip back keeps the filled side, even reversed, with smaller id first, and drops empty mirrors', async () => {
        const { conn, ownerId, deck, a, b, c, d } = await setup('permutations');
        await pairsRepo.upsert(conn, deck.id, b.id, a.id, { effect: 'BA', state: 'done' }, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, {}, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, c.id, d.id, { effect: 'CD', state: 'drafted' }, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, d.id, c.id, {}, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, a.id, c.id, {}, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, d.id, b.id, {}, { ordered: true });

        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ mode: 'combinations' });

        expect(res.status).toBe(200);
        expect(res.body.data.mode).toBe('combinations');
        expect(await rows(conn, deck.id)).toEqual([
            [a.id, b.id, 'BA'],
            [a.id, c.id, ''],
            [b.id, d.id, ''],
            [c.id, d.id, 'CD'],
        ]);
    });

    test('a reversed-only filled pair keeps its text through the flip back to permutations', async () => {
        const { conn, ownerId, deck, a, b } = await setup('permutations');
        await pairsRepo.upsert(conn, deck.id, b.id, a.id, { effect: 'BA', state: 'done' }, { ordered: true });

        await as(ownerId, 'patch', `/decks/${deck.id}`).send({ mode: 'combinations' });
        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ mode: 'permutations' });

        expect(res.status).toBe(200);
        expect(await rows(conn, deck.id)).toEqual([[a.id, b.id, 'BA']]);
    });
});
