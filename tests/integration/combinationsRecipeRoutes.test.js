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

const setup = async ({ recipe = false, mode = 'combinations' } = {}) => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const deck = await decksRepo.create(conn, { ownerId, name: 'Craft', mode, recipe });
    const wood = await cardsRepo.create(conn, { deckId: deck.id, name: 'Wood' });
    const stone = await cardsRepo.create(conn, { deckId: deck.id, name: 'Stone' });
    return { conn, ownerId, deck, wood, stone };
};

const putPair = (ownerId, deckId, body) => as(ownerId, 'put', `/decks/${deckId}/pairs`).send(body);

describe('PATCH /decks/:id recipe', () => {
    test('true links named pairs to result cards and false unlinks them', async () => {
        const { conn, ownerId, deck, wood, stone } = await setup();
        await pairsRepo.upsert(conn, deck.id, wood.id, stone.id, { name: 'Plank', state: 'done' });

        const on = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ recipe: true });
        const linked = (await pairsRepo.listByDeck(conn, deck.id))[0];
        const off = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ recipe: false });
        const unlinked = (await pairsRepo.listByDeck(conn, deck.id))[0];

        expect(on.body.data.recipe).toBe(true);
        expect(linked.result_card_id).not.toBeNull();
        expect((await cardsRepo.findById(conn, linked.result_card_id)).name).toBe('Plank');
        expect(off.body.data.recipe).toBe(false);
        expect(unlinked.result_card_id).toBeNull();
    });

    test('answers 409 and changes nothing for recipe on a permutations deck', async () => {
        const { conn, ownerId, deck } = await setup({ mode: 'permutations' });

        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ recipe: true });

        expect(res.status).toBe(409);
        expect((await decksRepo.findById(conn, deck.id)).is_recipe).toBe(0);
    });

    test('answers 409 and changes nothing for permutations on a recipe deck', async () => {
        const { conn, ownerId, deck } = await setup({ recipe: true });

        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ mode: 'permutations' });

        expect(res.status).toBe(409);
        expect((await decksRepo.findById(conn, deck.id)).pair_mode).toBe('combinations');
    });

    test('rejects a non-boolean recipe', async () => {
        const { ownerId, deck } = await setup();

        const res = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ recipe: 'yes' });

        expect(res.status).toBe(400);
    });
});

describe('PUT /decks/:id/pairs', () => {
    test('a recipe deck allows the same card twice and answers the pair plus cards', async () => {
        const { ownerId, deck, wood } = await setup({ recipe: true });

        const res = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: wood.id, name: 'Log' });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ cardAId: wood.id, cardBId: wood.id, name: 'Log' });
        expect(res.body.data.resultCardId).not.toBeNull();
        expect(res.body.data.cards.map((c) => c.name)).toEqual(['Wood', 'Stone', 'Log']);
    });

    test('other decks refuse the same card twice and answer only the pair', async () => {
        const { ownerId, deck, wood, stone } = await setup();

        const same = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: wood.id });
        const ok = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: stone.id, name: 'Plank' });

        expect(same.status).toBe(400);
        expect(ok.body.data).not.toHaveProperty('cards');
        expect(ok.body.data.resultCardId).toBeNull();
    });

    test('a result on an empty pair with no state makes it done; a given state is kept', async () => {
        const { ownerId, deck, wood, stone } = await setup({ recipe: true });

        const made = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: stone.id, name: 'Plank' });
        const struck = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: wood.id, name: 'Log', state: 'struck' });
        const bare = await putPair(ownerId, deck.id, { cardAId: stone.id, cardBId: stone.id, effect: 'x' });

        expect(made.body.data.state).toBe('done');
        expect(struck.body.data.state).toBe('struck');
        expect(bare.body.data.state).toBe('empty');
    });

    test('a recipe deck still refuses cards from another deck', async () => {
        const { conn, ownerId, deck, wood } = await setup({ recipe: true });
        const other = await decksRepo.create(conn, { ownerId, name: 'Other' });
        const foreign = await cardsRepo.create(conn, { deckId: other.id, name: 'F' });

        const res = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: foreign.id, name: 'X' });

        expect(res.status).toBe(400);
    });
});

describe('card edits in a recipe deck', () => {
    test('renaming a result card renames its pairs and deleting it blanks them', async () => {
        const { conn, ownerId, deck, wood, stone } = await setup({ recipe: true });
        const made = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: stone.id, name: 'Plank' });
        const plankId = made.body.data.resultCardId;

        await as(ownerId, 'patch', `/cards/${plankId}`).send({ name: 'Board' });
        const renamed = (await pairsRepo.listByDeck(conn, deck.id))[0];
        await as(ownerId, 'delete', `/cards/${plankId}`);
        const blanked = (await pairsRepo.listByDeck(conn, deck.id))[0];

        expect(renamed.name).toBe('Board');
        expect(blanked.name).toBe('');
        expect(blanked.result_card_id).toBeNull();
    });

    test('a patch without a name leaves pair names alone', async () => {
        const { conn, ownerId, deck, wood, stone } = await setup({ recipe: true });
        const made = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: stone.id, name: 'Plank' });

        await as(ownerId, 'patch', `/cards/${made.body.data.resultCardId}`).send({ detail: 'd' });

        expect((await pairsRepo.listByDeck(conn, deck.id))[0].name).toBe('Plank');
    });
});

test('end to end: craft, rename, clear', async () => {
    const { ownerId, deck, wood, stone } = await setup();
    await as(ownerId, 'patch', `/decks/${deck.id}`).send({ recipe: true });

    const made = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: stone.id, name: 'Plank' });
    const plank = made.body.data.cards.find((c) => c.name === 'Plank');
    const renamed = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: stone.id, name: 'Board' });
    const cleared = await putPair(ownerId, deck.id, { cardAId: wood.id, cardBId: stone.id, name: '' });

    expect(plank).toMatchObject({ crafted: true });
    expect(renamed.body.data.cards.map((c) => c.name)).toEqual(['Wood', 'Stone', 'Board']);
    expect(cleared.body.data.cards.map((c) => c.name)).toEqual(['Wood', 'Stone']);
    expect(cleared.body.data.resultCardId).toBeNull();
});
