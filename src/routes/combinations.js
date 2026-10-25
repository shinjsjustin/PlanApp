'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const decksRepo = require('../db/repositories/combinationDecksRepo');
const cardsRepo = require('../db/repositories/combinationCardsRepo');
const pairsRepo = require('../db/repositories/combinationPairsRepo');
const { badRequest, conflict, notFound } = require('../lib/httpError');
const { toComboCard, toComboDeck, toComboPair } = require('../lib/combinationSerializers');
const { foldToCombinations } = require('../lib/combinationMode');
const { applyResult, linkAllResults, unlinkAllResults } = require('../lib/combinationRecipes');
const { importDecks, promoteDeck } = require('../lib/combinationImport');
const {
    MAX_CARDS_PER_DECK,
    NAME_MAX_LENGTH,
    PAIR_STATES,
    TEXT_MAX_LENGTH,
    parseImport,
    toExportDeck,
} = require('../lib/combinationTransfer');
const { idSchema, parseId, requireSomeField } = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * Combinations: decks of cards whose unordered pairs are worked through. Mounted
 * at `/api/combinations` behind `isAuth`. A deck belongs to a user; cards and
 * pairs are reached through their deck.
 */

const router = express.Router();

const nameSchema = z
    .string({ error: 'name must be a string' })
    .trim()
    .min(1, 'name must not be empty')
    .max(NAME_MAX_LENGTH, `name must be at most ${NAME_MAX_LENGTH} characters`);

const textSchema = (field) =>
    z
        .string({ error: `${field} must be a string` })
        .max(TEXT_MAX_LENGTH, `${field} must be at most ${TEXT_MAX_LENGTH} characters`);

const PAIR_MODES = ['combinations', 'permutations'];

const projectIdSchema = idSchema.nullable();

const createDeckSchema = z.object({ name: nameSchema, projectId: projectIdSchema.optional() });
const patchDeckSchema = requireSomeField(
    z.object({
        name: nameSchema.optional(),
        projectId: projectIdSchema.optional(),
        mode: z.enum(PAIR_MODES, { error: `mode must be one of: ${PAIR_MODES.join(', ')}` }).optional(),
        recipe: z.boolean({ error: 'recipe must be a boolean' }).optional(),
    }),
    ['name', 'projectId', 'mode', 'recipe']
);
const createCardSchema = z.object({ name: nameSchema, detail: textSchema('detail').optional() });
const patchCardSchema = requireSomeField(
    z.object({
        name: nameSchema.optional(),
        detail: textSchema('detail').optional(),
        onX: z.boolean({ error: 'onX must be a boolean' }).optional(),
        onY: z.boolean({ error: 'onY must be a boolean' }).optional(),
    }),
    ['name', 'detail', 'onX', 'onY']
);
const moveSchema = z.object({
    direction: z.enum(['up', 'down'], { error: 'direction must be up or down' }),
});
const pairSchema = z.object({
    cardAId: idSchema,
    cardBId: idSchema,
    name: nameSchema.or(z.literal('')).optional(),
    effect: textSchema('effect').optional(),
    notes: textSchema('notes').optional(),
    state: z.enum(PAIR_STATES, { error: `state must be one of: ${PAIR_STATES.join(', ')}` }).optional(),
});
const listQuerySchema = z.object({ projectId: idSchema.optional() });

const countPairs = (pairs, state) => pairs.filter((pair) => pair.state === state).length;

/** The deck row with the counts the repo's list query would add. */
const withCounts = (deck, cards, pairs) => ({
    ...deck,
    card_count: cards.length,
    drafted_count: countPairs(pairs, 'drafted'),
    done_count: countPairs(pairs, 'done'),
    struck_count: countPairs(pairs, 'struck'),
});

const deckWire = async (conn, deck) =>
    toComboDeck(
        withCounts(
            deck,
            await cardsRepo.listByDeck(conn, deck.id),
            await pairsRepo.listByDeck(conn, deck.id)
        )
    );

/** A linked project must be the caller's own; null is always fine. */
const assertProjectUsable = async (conn, projectId, userId) => {
    if (projectId) await assertOwnership(conn, 'project', projectId, userId);
};

const assertNameFree = async (conn, userId, name, exceptId) => {
    if (await decksRepo.nameTaken(conn, userId, name, exceptId)) {
        throw conflict('You already have a deck with that name');
    }
};

// GET /api/combinations/decks[?projectId=]
router.get(
    '/decks',
    asyncRoute(async (req, res) => {
        const { projectId } = listQuerySchema.parse(req.query);

        const rows = await withConnection(async (conn) => {
            if (projectId) await assertOwnership(conn, 'project', projectId, req.user.id);

            return decksRepo.listByOwner(conn, req.user.id, { projectId });
        });

        res.sendData({ decks: rows.map(toComboDeck) });
    })
);

// POST /api/combinations/decks
router.post(
    '/decks',
    asyncRoute(async (req, res) => {
        const { name, projectId = null } = createDeckSchema.parse(req.body ?? {});

        const deck = await withTransaction(async (conn) => {
            await assertProjectUsable(conn, projectId, req.user.id);
            await assertNameFree(conn, req.user.id, name, null);

            return decksRepo.create(conn, { ownerId: req.user.id, name, projectId });
        });

        res.sendData(toComboDeck(withCounts(deck, [], [])), 201);
    })
);

// GET /api/combinations/decks/:id
router.get(
    '/decks/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const data = await withConnection(async (conn) => {
            await assertOwnership(conn, 'combinationDeck', id, req.user.id);
            const deck = await decksRepo.findById(conn, id);
            const cards = await cardsRepo.listByDeck(conn, id);
            const pairs = await pairsRepo.listByDeck(conn, id);

            return {
                deck: toComboDeck(withCounts(deck, cards, pairs)),
                cards: cards.map(toComboCard),
                pairs: pairs.map(toComboPair),
            };
        });

        res.sendData(data);
    })
);

// PATCH /api/combinations/decks/:id
router.patch(
    '/decks/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const fields = patchDeckSchema.parse(req.body ?? {});

        const wire = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationDeck', id, req.user.id);
            await assertProjectUsable(conn, fields.projectId, req.user.id);
            if (fields.name) await assertNameFree(conn, req.user.id, fields.name, id);

            const current = await decksRepo.findById(conn, id);
            const willBeRecipe = fields.recipe ?? Boolean(current.is_recipe);
            if (willBeRecipe && (fields.mode ?? current.pair_mode) === 'permutations') {
                throw conflict('A recipe deck cannot use permutations');
            }

            if (fields.mode === 'combinations' && current.pair_mode === 'permutations') {
                await foldToCombinations(conn, id);
            }

            const deck = await decksRepo.update(conn, id, fields);
            if (!deck) throw notFound('Deck');
            if (fields.recipe === true) await linkAllResults(conn, id);
            if (fields.recipe === false) await unlinkAllResults(conn, id);

            return deckWire(conn, deck);
        });

        res.sendData(wire);
    })
);

// DELETE /api/combinations/decks/:id
router.delete(
    '/decks/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationDeck', id, req.user.id);

            return decksRepo.remove(conn, id);
        });
        if (!deleted) throw notFound('Deck');

        res.sendData({ id });
    })
);

// POST /api/combinations/decks/:id/cards
router.post(
    '/decks/:id/cards',
    asyncRoute(async (req, res) => {
        const deckId = parseId(req.params.id);
        const fields = createCardSchema.parse(req.body ?? {});

        const card = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationDeck', deckId, req.user.id);
            const existing = await cardsRepo.listByDeck(conn, deckId);
            if (existing.length >= MAX_CARDS_PER_DECK) {
                throw badRequest(`A deck holds at most ${MAX_CARDS_PER_DECK} cards`);
            }

            return cardsRepo.create(conn, { deckId, ...fields });
        });

        res.sendData(toComboCard(card), 201);
    })
);

// PUT /api/combinations/decks/:id/pairs — creates or updates, cards in either order.
router.put(
    '/decks/:id/pairs',
    asyncRoute(async (req, res) => {
        const deckId = parseId(req.params.id);
        const { cardAId, cardBId, ...fields } = pairSchema.parse(req.body ?? {});

        const wire = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationDeck', deckId, req.user.id);
            const deck = await decksRepo.findById(conn, deckId);
            if (cardAId === cardBId && !deck.is_recipe) throw badRequest('A pair needs two different cards');
            const cardIds = (await cardsRepo.listByDeck(conn, deckId)).map((card) => card.id);
            if (!cardIds.includes(cardAId) || !cardIds.includes(cardBId)) {
                throw badRequest('Both cards must belong to this deck');
            }

            const ordered = deck.pair_mode === 'permutations';
            const pair = await pairsRepo.upsert(conn, deckId, cardAId, cardBId, fields, { ordered });
            if (!deck.is_recipe) return toComboPair(pair);

            const resultSet = fields.name !== undefined && fields.name.trim() !== '';
            if (resultSet && fields.state === undefined && pair.state === 'empty') {
                await pairsRepo.upsert(conn, deckId, cardAId, cardBId, { state: 'done' }, { ordered });
            }
            if (fields.name !== undefined) await applyResult(conn, deckId, pair.id, fields.name);

            const fresh = (await pairsRepo.listByDeck(conn, deckId)).find((p) => p.id === pair.id);
            const cards = await cardsRepo.listByDeck(conn, deckId);

            return { ...toComboPair(fresh), cards: cards.map(toComboCard) };
        });

        res.sendData(wire);
    })
);

// PATCH /api/combinations/cards/:id
router.patch(
    '/cards/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const fields = patchCardSchema.parse(req.body ?? {});

        const card = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationCard', id, req.user.id);

            const updated = await cardsRepo.update(conn, id, fields);
            if (updated && fields.name) await pairsRepo.setNameForResult(conn, id, fields.name);

            return updated;
        });
        if (!card) throw notFound('Card');

        res.sendData(toComboCard(card));
    })
);

// PUT /api/combinations/cards/:id/move — answers with the deck's cards in their new order.
router.put(
    '/cards/:id/move',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const { direction } = moveSchema.parse(req.body ?? {});

        const cards = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationCard', id, req.user.id);
            const moved = await cardsRepo.move(conn, id, direction);
            if (!moved) throw notFound('Card');

            return cardsRepo.listByDeck(conn, moved.deck_id);
        });

        res.sendData({ cards: cards.map(toComboCard) });
    })
);

// DELETE /api/combinations/cards/:id — answers with how many filled pairs went with it.
router.delete(
    '/cards/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const removedPairs = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationCard', id, req.user.id);
            const filled = await pairsRepo.countFilledForCard(conn, id);
            await pairsRepo.setNameForResult(conn, id, '');
            if (!(await cardsRepo.remove(conn, id))) throw notFound('Card');

            return filled;
        });

        res.sendData({ removedPairs });
    })
);

const exportDeck = async (conn, deck) =>
    toExportDeck(deck, await cardsRepo.listByDeck(conn, deck.id), await pairsRepo.listByDeck(conn, deck.id));

/** The new decks, in the wire shape with their counts. */
const decksWire = async (conn, decks) => {
    const wire = [];
    for (const deck of decks) wire.push(await deckWire(conn, deck));

    return wire;
};

// POST /api/combinations/import — any prototype JSON: one deck, a list, or { decks }.
router.post(
    '/import',
    asyncRoute(async (req, res) => {
        const parsed = parseImport(req.body);

        const decks = await withTransaction(async (conn) =>
            decksWire(conn, await importDecks(conn, req.user.id, parsed))
        );

        res.sendData({ decks }, 201);
    })
);

// GET /api/combinations/export[?projectId=]
router.get(
    '/export',
    asyncRoute(async (req, res) => {
        const { projectId } = listQuerySchema.parse(req.query);

        const decks = await withConnection(async (conn) => {
            if (projectId) await assertOwnership(conn, 'project', projectId, req.user.id);
            const rows = await decksRepo.listByOwner(conn, req.user.id, { projectId });
            const exported = [];
            for (const row of rows) exported.push(await exportDeck(conn, row));

            return exported;
        });

        res.sendData({ decks });
    })
);

// GET /api/combinations/decks/:id/export
router.get(
    '/decks/:id/export',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const exported = await withConnection(async (conn) => {
            await assertOwnership(conn, 'combinationDeck', id, req.user.id);

            return exportDeck(conn, await decksRepo.findById(conn, id));
        });

        res.sendData(exported);
    })
);

// POST /api/combinations/decks/:id/promote
router.post(
    '/decks/:id/promote',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const wire = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'combinationDeck', id, req.user.id);

            return deckWire(conn, await promoteDeck(conn, req.user.id, id));
        });

        res.sendData(wire, 201);
    })
);

module.exports = router;
