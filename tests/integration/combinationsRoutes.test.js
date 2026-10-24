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

const MAX_CARDS = 200;

const as = (userId, method, path) =>
    request(app)[method](`/api/combinations${path}`).set('Authorization', authHeaderFor(userId));

const setup = async () => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const strangerId = await createTestUser(conn);
    const deck = await decksRepo.create(conn, { ownerId, name: 'Spells' });
    const a = await cardsRepo.create(conn, { deckId: deck.id, name: 'A' });
    const b = await cardsRepo.create(conn, { deckId: deck.id, name: 'B' });
    const c = await cardsRepo.create(conn, { deckId: deck.id, name: 'C' });
    return { conn, ownerId, strangerId, deck, a, b, c };
};

describe('decks', () => {
    test('POST /decks trims the name, answers 201 in the wire shape and links an owned project', async () => {
        const { conn, ownerId } = await setup();
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });

        const res = await as(ownerId, 'post', '/decks').send({ name: '  New  ', projectId: project.id });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            name: 'New',
            projectId: project.id,
            sourceDeckId: null,
            cardCount: 0,
            counts: { drafted: 0, done: 0, struck: 0 },
        });
        expect(typeof res.body.data.createdAt).toBe('string');
    });

    test('POST /decks is 409 for a duplicate name and PATCH to a taken name is 409', async () => {
        const { conn, ownerId } = await setup();
        const other = await decksRepo.create(conn, { ownerId, name: 'Other' });

        const dup = await as(ownerId, 'post', '/decks').send({ name: 'Spells' });
        const patch = await as(ownerId, 'patch', `/decks/${other.id}`).send({ name: 'Spells' });

        expect(dup.status).toBe(409);
        expect(patch.status).toBe(409);
    });

    test.each([
        ['empty name', { name: '' }],
        ['whitespace name', { name: '   ' }],
        ['name over 200', { name: 'x'.repeat(201) }],
        ['missing name', {}],
    ])('POST /decks rejects %s with 400', async (_label, body) => {
        const { ownerId } = await setup();

        const res = await as(ownerId, 'post', '/decks').send(body);

        expect(res.status).toBe(400);
    });

    test('POST and PATCH refuse a project that is not the caller’s', async () => {
        const { conn, ownerId, strangerId, deck } = await setup();
        const theirs = await projectsRepo.create(conn, { ownerId: strangerId, title: 'T' });

        const create = await as(ownerId, 'post', '/decks').send({ name: 'X', projectId: theirs.id });
        const patch = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ projectId: theirs.id });

        expect(create.status).toBe(403);
        expect(patch.status).toBe(403);
        expect((await decksRepo.findById(conn, deck.id)).project_id).toBeNull();
    });

    test('GET /decks lists the caller’s decks and filters by projectId', async () => {
        const { conn, ownerId, strangerId, deck } = await setup();
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const linked = await decksRepo.create(conn, { ownerId, name: 'Linked', projectId: project.id });
        await decksRepo.create(conn, { ownerId: strangerId, name: 'Theirs' });

        const all = await as(ownerId, 'get', '/decks');
        const filtered = await as(ownerId, 'get', `/decks?projectId=${project.id}`);

        expect(all.status).toBe(200);
        expect(all.body.data.decks.map((d) => d.id).sort()).toEqual([deck.id, linked.id].sort());
        expect(all.body.data.decks.find((d) => d.id === deck.id).cardCount).toBe(3);
        expect(filtered.body.data.decks.map((d) => d.id)).toEqual([linked.id]);
    });

    test('GET /decks/:id returns deck, cards in order and pairs', async () => {
        const { conn, ownerId, deck, a, b, c } = await setup();
        await pairsRepo.upsert(conn, deck.id, c.id, a.id, { state: 'done', name: 'N', effect: 'E' });
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'struck' });

        const res = await as(ownerId, 'get', `/decks/${deck.id}`);

        expect(res.status).toBe(200);
        expect(res.body.data.deck).toMatchObject({
            id: deck.id,
            cardCount: 3,
            counts: { drafted: 0, done: 1, struck: 1 },
        });
        expect(res.body.data.cards).toEqual([
            { id: a.id, deckId: deck.id, name: 'A', detail: '', position: 0, onX: false, onY: false },
            { id: b.id, deckId: deck.id, name: 'B', detail: '', position: 1, onX: false, onY: false },
            { id: c.id, deckId: deck.id, name: 'C', detail: '', position: 2, onX: false, onY: false },
        ]);
        expect(res.body.data.pairs).toEqual([
            { id: expect.any(Number), cardAId: a.id, cardBId: b.id, name: '', effect: '', notes: '', state: 'struck' },
            { id: expect.any(Number), cardAId: a.id, cardBId: c.id, name: 'N', effect: 'E', notes: '', state: 'done' },
        ]);
    });

    test('PATCH /decks/:id renames, unlinks with null, and needs a field', async () => {
        const { conn, ownerId, deck } = await setup();
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        await decksRepo.update(conn, deck.id, { projectId: project.id });

        const rename = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ name: 'Renamed' });
        const unlink = await as(ownerId, 'patch', `/decks/${deck.id}`).send({ projectId: null });
        const empty = await as(ownerId, 'patch', `/decks/${deck.id}`).send({});

        expect(rename.body.data).toMatchObject({ name: 'Renamed', projectId: project.id, cardCount: 3 });
        expect(unlink.body.data).toMatchObject({ name: 'Renamed', projectId: null });
        expect(empty.status).toBe(400);
    });

    test('DELETE /decks/:id removes the deck and its cards', async () => {
        const { conn, ownerId, deck, a } = await setup();

        const res = await as(ownerId, 'delete', `/decks/${deck.id}`);

        expect(res.status).toBe(200);
        expect(await decksRepo.findById(conn, deck.id)).toBeNull();
        expect(await cardsRepo.findById(conn, a.id)).toBeNull();
    });
});

describe('cards', () => {
    test('POST /decks/:id/cards appends a trimmed card', async () => {
        const { ownerId, deck } = await setup();

        const res = await as(ownerId, 'post', `/decks/${deck.id}/cards`).send({ name: ' D ', detail: 'info' });

        expect(res.status).toBe(201);
        expect(res.body.data).toEqual({ id: expect.any(Number), deckId: deck.id, name: 'D', detail: 'info', position: 3, onX: false, onY: false });
    });

    test('POST card is 400 when the deck already has 200 cards', async () => {
        const { conn, ownerId, deck } = await setup();
        for (let i = 3; i < MAX_CARDS; i += 1) {
            await cardsRepo.create(conn, { deckId: deck.id, name: `c${i}` });
        }

        const res = await as(ownerId, 'post', `/decks/${deck.id}/cards`).send({ name: 'one too many' });

        expect(res.status).toBe(400);
        expect(await cardsRepo.listByDeck(conn, deck.id)).toHaveLength(MAX_CARDS);
    });

    test.each([
        ['empty name', { name: ' ' }],
        ['name over 200', { name: 'x'.repeat(201) }],
        ['detail over 5000', { name: 'ok', detail: 'x'.repeat(5001) }],
    ])('POST card rejects %s with 400', async (_label, body) => {
        const { ownerId, deck } = await setup();

        const res = await as(ownerId, 'post', `/decks/${deck.id}/cards`).send(body);

        expect(res.status).toBe(400);
    });

    test('PATCH /cards/:id updates fields, keeps the rest, and validates', async () => {
        const { ownerId, a } = await setup();

        const ok = await as(ownerId, 'patch', `/cards/${a.id}`).send({ detail: 'new' });
        const long = await as(ownerId, 'patch', `/cards/${a.id}`).send({ detail: 'x'.repeat(5001) });
        const blank = await as(ownerId, 'patch', `/cards/${a.id}`).send({ name: '  ' });
        const none = await as(ownerId, 'patch', `/cards/${a.id}`).send({});

        expect(ok.body.data).toMatchObject({ name: 'A', detail: 'new' });
        expect([long.status, blank.status, none.status]).toEqual([400, 400, 400]);
    });

    test('PUT /cards/:id/move swaps with a neighbour and rejects a bad direction', async () => {
        const { conn, ownerId, deck, a, b } = await setup();

        const down = await as(ownerId, 'put', `/cards/${a.id}/move`).send({ direction: 'down' });
        const bad = await as(ownerId, 'put', `/cards/${a.id}/move`).send({ direction: 'sideways' });

        expect(down.status).toBe(200);
        expect(down.body.data.cards.map((c) => c.name)).toEqual(['B', 'A', 'C']);
        expect(bad.status).toBe(400);
        expect((await cardsRepo.listByDeck(conn, deck.id)).map((c) => c.id)[0]).toBe(b.id);
    });

    test('DELETE /cards/:id reports removed filled pairs and closes the gap', async () => {
        const { conn, ownerId, deck, a, b, c } = await setup();
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'done' });
        await pairsRepo.upsert(conn, deck.id, a.id, c.id, { state: 'empty' });

        const res = await as(ownerId, 'delete', `/cards/${a.id}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ removedPairs: 1 });
        expect(await pairsRepo.listByDeck(conn, deck.id)).toEqual([]);
        expect((await cardsRepo.listByDeck(conn, deck.id)).map((x) => x.position)).toEqual([0, 1]);
    });
});

describe('PUT /decks/:id/pairs', () => {
    test('creates a pair in either order, then updates the same pair keeping other fields', async () => {
        const { conn, ownerId, deck, a, b } = await setup();

        const first = await as(ownerId, 'put', `/decks/${deck.id}/pairs`).send({
            cardAId: b.id, cardBId: a.id, name: ' Combo ', effect: 'boom', state: 'drafted',
        });
        const second = await as(ownerId, 'put', `/decks/${deck.id}/pairs`).send({
            cardAId: a.id, cardBId: b.id, notes: 'n', state: 'done',
        });

        expect(first.status).toBe(200);
        expect(first.body.data).toMatchObject({ cardAId: a.id, cardBId: b.id, name: 'Combo', state: 'drafted' });
        expect(second.body.data).toMatchObject({
            id: first.body.data.id, name: 'Combo', effect: 'boom', notes: 'n', state: 'done',
        });
        expect(await pairsRepo.listByDeck(conn, deck.id)).toHaveLength(1);
    });

    test('is 400 for the same card twice, a card outside the deck, and a bad state', async () => {
        const { conn, ownerId, deck, a, b } = await setup();
        const otherDeck = await decksRepo.create(conn, { ownerId, name: 'Other' });
        const foreign = await cardsRepo.create(conn, { deckId: otherDeck.id, name: 'F' });
        const put = (body) => as(ownerId, 'put', `/decks/${deck.id}/pairs`).send(body);

        const same = await put({ cardAId: a.id, cardBId: a.id });
        const outside = await put({ cardAId: a.id, cardBId: foreign.id });
        const state = await put({ cardAId: a.id, cardBId: b.id, state: 'maybe' });
        const long = await put({ cardAId: a.id, cardBId: b.id, effect: 'x'.repeat(5001) });
        const longNotes = await put({ cardAId: a.id, cardBId: b.id, notes: 'x'.repeat(5001) });
        const longName = await put({ cardAId: a.id, cardBId: b.id, name: 'x'.repeat(201) });

        expect([same, outside, state, long, longNotes, longName].map((r) => r.status))
            .toEqual([400, 400, 400, 400, 400, 400]);
        expect(await pairsRepo.listByDeck(conn, deck.id)).toEqual([]);
    });
});

describe('access control', () => {
    test('every route answers 401 without a token', async () => {
        const { deck, a } = await setup();
        const routes = [
            ['get', '/decks'], ['post', '/decks'], ['get', `/decks/${deck.id}`],
            ['patch', `/decks/${deck.id}`], ['delete', `/decks/${deck.id}`],
            ['post', `/decks/${deck.id}/cards`], ['put', `/decks/${deck.id}/pairs`],
            ['patch', `/cards/${a.id}`], ['put', `/cards/${a.id}/move`], ['delete', `/cards/${a.id}`],
        ];

        for (const [method, path] of routes) {
            const res = await request(app)[method](`/api/combinations${path}`).send({});
            expect([method, path, res.status]).toEqual([method, path, 401]);
        }
    });

    test('every route refuses another user’s deck or card and changes nothing', async () => {
        const { conn, strangerId, deck, a, b } = await setup();
        const routes = [
            ['get', `/decks/${deck.id}`, {}],
            ['patch', `/decks/${deck.id}`, { name: 'Hijack' }],
            ['delete', `/decks/${deck.id}`, {}],
            ['post', `/decks/${deck.id}/cards`, { name: 'X' }],
            ['put', `/decks/${deck.id}/pairs`, { cardAId: a.id, cardBId: b.id, state: 'done' }],
            ['patch', `/cards/${a.id}`, { name: 'Hijack' }],
            ['put', `/cards/${a.id}/move`, { direction: 'down' }],
            ['delete', `/cards/${a.id}`, {}],
        ];

        for (const [method, path, body] of routes) {
            const res = await as(strangerId, method, path).send(body);
            expect([method, path, res.status]).toEqual([method, path, 403]);
        }
        expect((await decksRepo.findById(conn, deck.id)).name).toBe('Spells');
        expect((await cardsRepo.listByDeck(conn, deck.id)).map((c) => c.name)).toEqual(['A', 'B', 'C']);
        expect(await pairsRepo.listByDeck(conn, deck.id)).toEqual([]);
    });

    test('missing decks and cards are 404', async () => {
        const { ownerId } = await setup();

        const deck = await as(ownerId, 'get', '/decks/987654321');
        const card = await as(ownerId, 'delete', '/cards/987654321');

        expect([deck.status, card.status]).toEqual([404, 404]);
    });
});
