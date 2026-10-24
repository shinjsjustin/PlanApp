'use strict';

const request = require('supertest');

const app = require('../../src/server');
const decksRepo = require('../../src/db/repositories/combinationDecksRepo');
const cardsRepo = require('../../src/db/repositories/combinationCardsRepo');
const pairsRepo = require('../../src/db/repositories/combinationPairsRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId, method, path) =>
    request(app)[method](`/api/combinations${path}`).set('Authorization', authHeaderFor(userId));

const deckA = {
    id: 'd1',
    name: 'Alpha',
    cards: [
        { id: 'x', name: 'X', detail: 'ex' },
        { id: 'y', name: 'Y' },
        { id: 'z', name: 'Z', detail: 'zed' },
    ],
    pairs: {
        'y|x': { name: 'XY', effect: 'both', notes: 'n', state: 'done' },
        'x|ghost': { name: 'skip', state: 'done' },
    },
};
const deckB = { name: 'Beta', cards: [{ id: 'q', name: 'Q' }], pairs: {} };

const seedDeck = () => {
    const cards = [
        ['fire', 'Fire', 'Bullets ignite enemies, dealing damage over time.'],
        ['explosive', 'Explosive', 'Bullets explode on impact for small area damage.'],
        ['pierce', 'Pierce', 'Bullets pass through the first enemy they hit.'],
    ].map(([id, name, detail]) => ({ id, name, detail }));
    return {
        id: 'd_seed',
        name: 'HordeGame augments',
        cards,
        pairs: {
            'explosive|fire': { name: 'Napalm', effect: 'Burning ground.', notes: 'Cap.', state: 'done' },
            'explosive|pierce': { name: 'Breach Round', effect: 'Small explosions.', notes: '', state: 'done' },
            'fire|pierce': { name: '', effect: 'Hmm', notes: '', state: 'struck' },
        },
    };
};

const fullDeck = async (conn, deckId) => ({
    cards: await cardsRepo.listByDeck(conn, deckId),
    pairs: await pairsRepo.listByDeck(conn, deckId),
});

describe('POST /import', () => {
    test('creates one deck per imported deck from { decks }, mapping cards and pairs', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const res = await as(ownerId, 'post', '/import').send({ decks: [deckA, deckB] });

        expect(res.status).toBe(201);
        expect(res.body.data.decks).toHaveLength(2);
        expect(res.body.data.decks[0]).toMatchObject({
            name: 'Alpha',
            cardCount: 3,
            counts: { drafted: 0, done: 1, struck: 0 },
            projectId: null,
        });
        expect(res.body.data.decks[1]).toMatchObject({ name: 'Beta', cardCount: 1 });
        const { cards, pairs } = await fullDeck(conn, res.body.data.decks[0].id);
        expect(cards.map((c) => [c.name, c.detail, c.position])).toEqual([
            ['X', 'ex', 0],
            ['Y', '', 1],
            ['Z', 'zed', 2],
        ]);
        expect(pairs).toHaveLength(1);
        expect(pairs[0]).toMatchObject({
            card_a_id: cards[0].id,
            card_b_id: cards[1].id,
            name: 'XY',
            effect: 'both',
            notes: 'n',
            state: 'done',
        });
    });

    test('accepts the prototype seed deck as a single object', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const res = await as(ownerId, 'post', '/import').send(seedDeck());

        expect(res.status).toBe(201);
        expect(res.body.data.decks[0]).toMatchObject({
            name: 'HordeGame augments',
            cardCount: 3,
            counts: { drafted: 0, done: 2, struck: 1 },
        });
    });

    test('skips a pair whose key names an unknown card', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const res = await as(ownerId, 'post', '/import').send([deckA]);

        expect(res.status).toBe(201);
        const { pairs } = await fullDeck(conn, res.body.data.decks[0].id);
        expect(pairs.map((p) => p.name)).toEqual(['XY']);
    });

    test('a bad second deck is 400 and the first deck is not saved', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const res = await as(ownerId, 'post', '/import').send({ decks: [deckB, { name: 'Bad' }] });

        expect(res.status).toBe(400);
        expect(await decksRepo.listByOwner(conn, ownerId)).toHaveLength(0);
    });

    test('an empty deck list is 400', async () => {
        const ownerId = await createTestUser(getConn());

        const res = await as(ownerId, 'post', '/import').send({ decks: [] });

        expect(res.status).toBe(400);
    });

    test('a rejected import rolls back a deck whose insert already ran', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const tooLong = { name: 'Second', cards: [{ id: 'a', name: 'x'.repeat(201) }], pairs: {} };

        const res = await as(ownerId, 'post', '/import').send({ decks: [deckB, tooLong] });

        expect(res.status).toBe(400);
        expect(await decksRepo.listByOwner(conn, ownerId)).toHaveLength(0);
    });

    test('a blank card name is 400 naming the deck and saves nothing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const blank = { name: 'Blanky', cards: [{ id: 'a', name: '   ' }], pairs: {} };

        const res = await as(ownerId, 'post', '/import').send({ decks: [deckB, blank] });

        expect(res.status).toBe(400);
        expect(res.body.error.message ?? res.body.error).toContain('Blanky');
        expect(await decksRepo.listByOwner(conn, ownerId)).toHaveLength(0);
    });

    test('an over-limit deck is 400 naming it and saves nothing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const cards = Array.from({ length: 201 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }));

        const res = await as(ownerId, 'post', '/import').send({ decks: [deckB, { name: 'Huge', cards }] });

        expect(res.status).toBe(400);
        expect(res.body.error.message ?? res.body.error).toContain('Huge');
        expect(await decksRepo.listByOwner(conn, ownerId)).toHaveLength(0);
    });

    test('names that clash with an existing or earlier deck get (2), (3)', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await decksRepo.create(conn, { ownerId, name: 'Beta' });

        const res = await as(ownerId, 'post', '/import').send({
            decks: [deckB, deckB, { ...deckB, name: 'Fresh' }, { ...deckB, name: 'Fresh' }],
        });

        expect(res.body.data.decks.map((d) => d.name)).toEqual([
            'Beta (2)',
            'Beta (3)',
            'Fresh',
            'Fresh (2)',
        ]);
    });

    test('accepts a body of about 1 MB', async () => {
        const ownerId = await createTestUser(getConn());
        const cards = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, detail: 'd'.repeat(5000) }));
        const big = { name: 'Big', cards, pairs: {} };

        const res = await as(ownerId, 'post', '/import').send(big);

        expect(res.status).toBe(201);
        expect(res.body.data.decks[0].cardCount).toBe(200);
    });
});

describe('export', () => {
    const build = async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const deck = await decksRepo.create(conn, { ownerId, name: 'Spells', projectId: project.id });
        const a = await cardsRepo.create(conn, { deckId: deck.id, name: 'A', detail: 'da', onX: true, onY: true });
        const b = await cardsRepo.create(conn, { deckId: deck.id, name: 'B', onX: true });
        await pairsRepo.upsert(conn, deck.id, b.id, a.id, { name: 'AB', effect: 'e', state: 'done' });
        await decksRepo.create(conn, { ownerId, name: 'Loose' });
        await decksRepo.create(conn, { ownerId: strangerId, name: 'Theirs' });
        return { conn, ownerId, strangerId, project, deck, a, b };
    };

    test('GET /decks/:id/export returns the prototype deck object', async () => {
        const { ownerId, deck, a, b } = await build();

        const res = await as(ownerId, 'get', `/decks/${deck.id}/export`);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            id: `d_${deck.id}`,
            name: 'Spells',
            mode: 'combinations',
            cards: [
                { id: `c_${a.id}`, name: 'A', detail: 'da', onX: true, onY: true },
                { id: `c_${b.id}`, name: 'B', detail: '', onX: true, onY: false },
            ],
            pairs: { [`c_${a.id}|c_${b.id}`]: { name: 'AB', effect: 'e', notes: '', state: 'done' } },
        });
    });

    test('GET /decks/:id/export is 403 for another user and 404 when missing', async () => {
        const { strangerId, deck } = await build();

        expect((await as(strangerId, 'get', `/decks/${deck.id}/export`)).status).toBe(403);
        expect((await as(strangerId, 'get', '/decks/99999999/export')).status).toBe(404);
    });

    test('GET /export returns all the caller’s decks, filtered by projectId', async () => {
        const { ownerId, strangerId, project } = await build();

        const all = await as(ownerId, 'get', '/export');
        const filtered = await as(ownerId, 'get', `/export?projectId=${project.id}`);
        const foreign = await as(strangerId, 'get', `/export?projectId=${project.id}`);

        expect(all.body.data.decks.map((d) => d.name).sort()).toEqual(['Loose', 'Spells']);
        expect(filtered.body.data.decks.map((d) => d.name)).toEqual(['Spells']);
        expect(foreign.status).toBe(403);
    });

    test('export then import round-trips cards, pairs and states', async () => {
        const { ownerId, deck } = await build();
        const exported = await as(ownerId, 'get', '/export');

        const res = await as(ownerId, 'post', '/import').send(exported.body.data);

        expect(res.status).toBe(201);
        const names = res.body.data.decks.map((d) => d.name).sort();
        expect(names).toEqual(['Loose (2)', 'Spells (2)']);
        const copy = res.body.data.decks.find((d) => d.name === 'Spells (2)');
        expect(copy).toMatchObject({ cardCount: 2, counts: { drafted: 0, done: 1, struck: 0 } });
        const original = await as(ownerId, 'get', `/decks/${deck.id}`);
        const copied = await as(ownerId, 'get', `/decks/${copy.id}`);
        expect(copied.body.data.cards.map((c) => [c.name, c.detail])).toEqual(
            original.body.data.cards.map((c) => [c.name, c.detail])
        );
        expect(copied.body.data.pairs.map((p) => [p.name, p.effect, p.state])).toEqual([['AB', 'e', 'done']]);
        const copiedCards = await cardsRepo.listByDeck(getConn(), copy.id);
        expect(copiedCards.map((c) => [c.on_x, c.on_y])).toEqual([[1, 1], [1, 0]]);
    });

    test('a permutations deck round-trips mode, axes and both orders', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'Perm', mode: 'permutations' });
        const a = await cardsRepo.create(conn, { deckId: deck.id, name: 'A', onX: true, onY: true });
        const b = await cardsRepo.create(conn, { deckId: deck.id, name: 'B', onX: true, onY: false });
        await pairsRepo.upsert(conn, deck.id, b.id, a.id, { name: 'BA', state: 'done' }, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { name: 'AB', state: 'drafted' }, { ordered: true });

        const exported = await as(ownerId, 'get', `/decks/${deck.id}/export`);
        const res = await as(ownerId, 'post', '/import').send(exported.body.data);

        expect(res.status).toBe(201);
        const copy = res.body.data.decks[0];
        expect(copy.mode).toBe('permutations');
        const { cards, pairs } = await fullDeck(conn, copy.id);
        expect(cards.map((c) => [c.name, c.on_x, c.on_y])).toEqual([['A', 1, 1], ['B', 1, 0]]);
        expect(pairs.map((p) => [p.card_a_id, p.card_b_id, p.name]).sort()).toEqual(
            [
                [cards[1].id, cards[0].id, 'BA'],
                [cards[0].id, cards[1].id, 'AB'],
            ].sort()
        );
    });

    test('an old prototype file imports as combinations with every card on both axes', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const res = await as(ownerId, 'post', '/import').send(deckA);

        const copy = res.body.data.decks[0];
        expect(copy.mode).toBe('combinations');
        const { cards } = await fullDeck(conn, copy.id);
        expect(cards.map((c) => [c.on_x, c.on_y])).toEqual([[1, 1], [1, 1], [1, 1]]);
    });
});

describe('POST /decks/:id/promote', () => {
    const build = async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const deck = await decksRepo.create(conn, { ownerId, name: 'Src', projectId: project.id });
        for (const name of ['A', 'B', 'C']) {
            await cardsRepo.create(conn, { deckId: deck.id, name, onX: true, onY: true });
        }
        return { conn, ownerId, project, deck };
    };

    test('makes a linked deck with one card per done pair in grid order', async () => {
        const { conn, ownerId, project, deck } = await build();
        const [a, b, c] = await cardsRepo.listByDeck(conn, deck.id);
        await cardsRepo.move(conn, c.id, 'up');
        await cardsRepo.move(conn, c.id, 'up');
        // order is now C, A, B
        await pairsRepo.upsert(conn, deck.id, b.id, a.id, { name: 'Named', effect: 'E1', state: 'done' });
        await pairsRepo.upsert(conn, deck.id, c.id, b.id, { name: '', effect: 'E2', state: 'done' });
        await pairsRepo.upsert(conn, deck.id, c.id, a.id, { name: 'Skip', effect: 'E3', state: 'drafted' });

        const res = await as(ownerId, 'post', `/decks/${deck.id}/promote`);

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            name: 'Src · done pairs',
            sourceDeckId: deck.id,
            projectId: project.id,
            cardCount: 2,
        });
        const { cards, pairs } = await fullDeck(conn, res.body.data.id);
        expect(cards.map((x) => [x.name, x.detail])).toEqual([
            ['C + B', 'E2'],
            ['Named', 'E1'],
        ]);
        expect(pairs).toHaveLength(0);
        expect(cards.map((x) => [x.on_x, x.on_y])).toEqual([[1, 1], [1, 1]]);
        expect(res.body.data.mode).toBe('combinations');
    });

    test('skips a done pair whose card left an axis', async () => {
        const { conn, ownerId, deck } = await build();
        const [a, b, c] = await cardsRepo.listByDeck(conn, deck.id);
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { name: 'AB', state: 'done' });
        await pairsRepo.upsert(conn, deck.id, a.id, c.id, { name: 'AC', state: 'done' });
        await cardsRepo.update(conn, c.id, { onX: false, onY: false });

        const res = await as(ownerId, 'post', `/decks/${deck.id}/promote`);

        const { cards } = await fullDeck(conn, res.body.data.id);
        expect(cards.map((x) => x.name)).toEqual(['AB']);
    });

    test('promotes only visible done pairs of a permutations deck into combinations', async () => {
        const { conn, ownerId, deck } = await build();
        const [a, b, c] = await cardsRepo.listByDeck(conn, deck.id);
        await decksRepo.update(conn, deck.id, { mode: 'permutations' });
        await cardsRepo.update(conn, a.id, { onX: false });
        await cardsRepo.update(conn, b.id, { onY: false });
        // a is row-only, b is column-only: A|B shows, B|A does not
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { name: 'Shown', state: 'done' }, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, b.id, a.id, { name: 'Hidden', state: 'done' }, { ordered: true });
        await pairsRepo.upsert(conn, deck.id, c.id, c.id, { name: 'Self', state: 'drafted' }, { ordered: true });

        const res = await as(ownerId, 'post', `/decks/${deck.id}/promote`);

        expect(res.body.data.mode).toBe('combinations');
        const { cards } = await fullDeck(conn, res.body.data.id);
        expect(cards.map((x) => x.name)).toEqual(['Shown']);
    });

    test('with no done pairs the new deck has no cards', async () => {
        const { ownerId, deck } = await build();

        const res = await as(ownerId, 'post', `/decks/${deck.id}/promote`);

        expect(res.status).toBe(201);
        expect(res.body.data.cardCount).toBe(0);
    });

    test('promoting twice names the second deck with (2)', async () => {
        const { ownerId, deck } = await build();

        await as(ownerId, 'post', `/decks/${deck.id}/promote`);
        const second = await as(ownerId, 'post', `/decks/${deck.id}/promote`);

        expect(second.body.data.name).toBe('Src · done pairs (2)');
    });

    test('is 403 for another user’s deck', async () => {
        const { conn, deck } = await build();
        const strangerId = await createTestUser(conn);

        const res = await as(strangerId, 'post', `/decks/${deck.id}/promote`);

        expect(res.status).toBe(403);
    });
});
