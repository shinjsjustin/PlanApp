'use strict';

const assertOwnership = require('../../src/middleware/assertOwnership');
const decksRepo = require('../../src/db/repositories/combinationDecksRepo');
const cardsRepo = require('../../src/db/repositories/combinationCardsRepo');
const pairsRepo = require('../../src/db/repositories/combinationPairsRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const makeCards = async (conn, deckId, names) => {
    const cards = [];
    for (const name of names) {
        cards.push(await cardsRepo.create(conn, { deckId, name }));
    }
    return cards;
};

const namesInOrder = async (conn, deckId) =>
    (await cardsRepo.listByDeck(conn, deckId)).map((c) => c.name);

describe('combinationDecksRepo', () => {
    test('create then findById returns the deck, and findById is null for a missing id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const deck = await decksRepo.create(conn, { ownerId, name: 'Spells' });

        expect(await decksRepo.findById(conn, deck.id)).toMatchObject({
            id: deck.id,
            owner_id: ownerId,
            name: 'Spells',
            project_id: null,
        });
        expect(await decksRepo.findById(conn, 987654321)).toBeNull();
    });

    test('listByOwner counts cards and pair states, per deck', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'Counted' });
        const other = await decksRepo.create(conn, { ownerId, name: 'Other' });
        const [a, b, c, d] = await makeCards(conn, deck.id, ['a', 'b', 'c', 'd']);
        await makeCards(conn, other.id, ['x']);
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'drafted' });
        await pairsRepo.upsert(conn, deck.id, a.id, c.id, { state: 'done' });
        await pairsRepo.upsert(conn, deck.id, b.id, c.id, { state: 'done' });
        await pairsRepo.upsert(conn, deck.id, c.id, d.id, { state: 'struck' });
        await pairsRepo.upsert(conn, deck.id, a.id, d.id, { state: 'empty' });

        const rows = await decksRepo.listByOwner(conn, ownerId, {});

        const counted = rows.find((r) => r.id === deck.id);
        expect(counted).toMatchObject({
            card_count: 4,
            drafted_count: 1,
            done_count: 2,
            struck_count: 1,
        });
        expect(rows.find((r) => r.id === other.id)).toMatchObject({
            card_count: 1,
            drafted_count: 0,
            done_count: 0,
            struck_count: 0,
        });
    });

    test("listByOwner never returns another owner's decks", async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const mine = await decksRepo.create(conn, { ownerId, name: 'Mine' });
        await decksRepo.create(conn, { ownerId: otherId, name: 'Theirs' });

        const rows = await decksRepo.listByOwner(conn, ownerId, {});

        expect(rows.map((r) => r.id)).toEqual([mine.id]);
    });

    test('listByOwner filters by projectId when given', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const inProject = await decksRepo.create(conn, {
            ownerId,
            name: 'In',
            projectId: project.id,
        });
        await decksRepo.create(conn, { ownerId, name: 'Out' });

        const rows = await decksRepo.listByOwner(conn, ownerId, { projectId: project.id });

        expect(rows.map((r) => r.id)).toEqual([inProject.id]);
    });

    test('update changes name and projectId, keeping unspecified fields, and is null for a missing deck', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const deck = await decksRepo.create(conn, { ownerId, name: 'Old' });

        const renamed = await decksRepo.update(conn, deck.id, { name: 'New' });
        const linked = await decksRepo.update(conn, deck.id, { projectId: project.id });
        const unlinked = await decksRepo.update(conn, deck.id, { projectId: null });

        expect(renamed).toMatchObject({ name: 'New', project_id: null });
        expect(linked).toMatchObject({ name: 'New', project_id: project.id });
        expect(unlinked).toMatchObject({ name: 'New', project_id: null });
        expect(await decksRepo.update(conn, 987654321, { name: 'x' })).toBeNull();
    });

    test('remove deletes the deck and reports whether one existed', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'Gone' });

        expect(await decksRepo.remove(conn, deck.id)).toBe(true);
        expect(await decksRepo.remove(conn, deck.id)).toBe(false);
        expect(await decksRepo.findById(conn, deck.id)).toBeNull();
    });

    test('nameTaken is true for the same owner and name, except for exceptId', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'Taken' });

        expect(await decksRepo.nameTaken(conn, ownerId, 'Taken')).toBe(true);
        expect(await decksRepo.nameTaken(conn, ownerId, 'Taken', deck.id)).toBe(false);
        expect(await decksRepo.nameTaken(conn, ownerId, 'Free')).toBe(false);
        expect(await decksRepo.nameTaken(conn, otherId, 'Taken')).toBe(false);
    });

    test("deleting a project sets its decks' project_id to NULL", async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const project = await projectsRepo.create(conn, { ownerId, title: 'P' });
        const deck = await decksRepo.create(conn, { ownerId, name: 'D', projectId: project.id });

        await projectsRepo.remove(conn, project.id);

        expect(await decksRepo.findById(conn, deck.id)).toMatchObject({ project_id: null });
    });

    test('deleting a deck cascades its cards and pairs', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const [a, b] = await makeCards(conn, deck.id, ['a', 'b']);
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'done' });

        await decksRepo.remove(conn, deck.id);

        expect(await cardsRepo.findById(conn, a.id)).toBeNull();
        expect(await pairsRepo.listByDeck(conn, deck.id)).toEqual([]);
    });
});

describe('combinationCardsRepo', () => {
    test('create appends at the next 0-based position and listByDeck returns them in order', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const other = await decksRepo.create(conn, { ownerId, name: 'E' });

        const [a, b, c] = await makeCards(conn, deck.id, ['a', 'b', 'c']);
        await makeCards(conn, other.id, ['z']);

        expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);
        expect(await namesInOrder(conn, deck.id)).toEqual(['a', 'b', 'c']);
    });

    test('update changes name and detail, keeping unspecified fields', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const card = await cardsRepo.create(conn, { deckId: deck.id, name: 'a', detail: 'd1' });

        const renamed = await cardsRepo.update(conn, card.id, { name: 'b' });
        const detailed = await cardsRepo.update(conn, card.id, { detail: 'd2' });

        expect(renamed).toMatchObject({ name: 'b', detail: 'd1' });
        expect(detailed).toMatchObject({ name: 'b', detail: 'd2' });
        expect(await cardsRepo.update(conn, 987654321, { name: 'x' })).toBeNull();
    });

    test('move swaps with its neighbour and is a no-op at either end', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const [a, b, c] = await makeCards(conn, deck.id, ['a', 'b', 'c']);

        await cardsRepo.move(conn, b.id, 'up');
        expect(await namesInOrder(conn, deck.id)).toEqual(['b', 'a', 'c']);

        await cardsRepo.move(conn, b.id, 'up');
        expect(await namesInOrder(conn, deck.id)).toEqual(['b', 'a', 'c']);

        await cardsRepo.move(conn, a.id, 'down');
        expect(await namesInOrder(conn, deck.id)).toEqual(['b', 'c', 'a']);

        await cardsRepo.move(conn, a.id, 'down');
        expect(await namesInOrder(conn, deck.id)).toEqual(['b', 'c', 'a']);

        const positions = (await cardsRepo.listByDeck(conn, deck.id)).map((x) => x.position);
        expect(positions).toEqual([0, 1, 2]);
        expect(c.id).toBeDefined();
    });

    test('remove closes the gap so positions stay contiguous, and cascades its pairs', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const [a, b, c] = await makeCards(conn, deck.id, ['a', 'b', 'c']);
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'done' });
        await pairsRepo.upsert(conn, deck.id, a.id, c.id, { state: 'done' });

        expect(await cardsRepo.remove(conn, b.id)).toBe(true);
        expect(await cardsRepo.remove(conn, b.id)).toBe(false);

        const rows = await cardsRepo.listByDeck(conn, deck.id);
        expect(rows.map((r) => [r.name, r.position])).toEqual([
            ['a', 0],
            ['c', 1],
        ]);
        const pairs = await pairsRepo.listByDeck(conn, deck.id);
        expect(pairs).toHaveLength(1);
        expect(pairs[0]).toMatchObject({ card_a_id: a.id, card_b_id: c.id });
    });
});

describe('combinationPairsRepo', () => {
    test('upsert stores the smaller id as card_a_id whichever order it is given', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const [a, b] = await makeCards(conn, deck.id, ['a', 'b']);

        const pair = await pairsRepo.upsert(conn, deck.id, b.id, a.id, { name: 'Fire' });

        expect(pair).toMatchObject({ card_a_id: a.id, card_b_id: b.id, name: 'Fire' });
    });

    test('upsert on an existing pair keeps unspecified fields and does not duplicate', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const [a, b] = await makeCards(conn, deck.id, ['a', 'b']);
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, {
            name: 'Fire',
            effect: 'burns',
            notes: 'n',
            state: 'drafted',
        });

        const pair = await pairsRepo.upsert(conn, deck.id, b.id, a.id, { state: 'done' });

        expect(pair).toMatchObject({
            name: 'Fire',
            effect: 'burns',
            notes: 'n',
            state: 'done',
        });
        expect(await pairsRepo.listByDeck(conn, deck.id)).toHaveLength(1);
    });

    test('a new pair defaults to empty fields and state', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const [a, b] = await makeCards(conn, deck.id, ['a', 'b']);

        const pair = await pairsRepo.upsert(conn, deck.id, a.id, b.id, { effect: 'e' });

        expect(pair).toMatchObject({ name: '', effect: 'e', notes: '', state: 'empty' });
    });

    test('listByDeck returns only that deck', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const other = await decksRepo.create(conn, { ownerId, name: 'E' });
        const [a, b] = await makeCards(conn, deck.id, ['a', 'b']);
        const [x, y] = await makeCards(conn, other.id, ['x', 'y']);
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'done' });
        await pairsRepo.upsert(conn, other.id, x.id, y.id, { state: 'done' });

        const rows = await pairsRepo.listByDeck(conn, deck.id);

        expect(rows).toHaveLength(1);
        expect(rows[0].deck_id).toBe(deck.id);
    });

    test("countFilledForCard counts pairs whose state is not 'empty', on either side", async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
        const [a, b, c, d] = await makeCards(conn, deck.id, ['a', 'b', 'c', 'd']);
        await pairsRepo.upsert(conn, deck.id, a.id, b.id, { state: 'drafted' });
        await pairsRepo.upsert(conn, deck.id, c.id, a.id, { state: 'struck' });
        await pairsRepo.upsert(conn, deck.id, a.id, d.id, { state: 'empty' });
        await pairsRepo.upsert(conn, deck.id, b.id, c.id, { state: 'done' });

        expect(await pairsRepo.countFilledForCard(conn, a.id)).toBe(2);
        expect(await pairsRepo.countFilledForCard(conn, d.id)).toBe(0);
    });
});

describe('assertOwnership for combinations', () => {
    test.each(['combinationDeck', 'combinationCard'])(
        '%s resolves for its owner, 403 for another user, 404 when missing',
        async (type) => {
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const intruderId = await createTestUser(conn);
            const deck = await decksRepo.create(conn, { ownerId, name: 'D' });
            const card = await cardsRepo.create(conn, { deckId: deck.id, name: 'a' });
            const id = type === 'combinationDeck' ? deck.id : card.id;

            const owned = await assertOwnership(conn, type, id, ownerId);

            expect(owned.owner_id).toBe(ownerId);
            await expect(assertOwnership(conn, type, id, intruderId)).rejects.toMatchObject({
                status: 403,
            });
            await expect(assertOwnership(conn, type, 987654321, ownerId)).rejects.toMatchObject({
                status: 404,
            });
        }
    );
});
