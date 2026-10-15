'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const thoughtsRepo = require('../db/repositories/thoughtsRepo');
const { notFound } = require('../lib/httpError');
const { toThought } = require('../lib/serializers');
const { parseId } = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * Thoughts: throwaway notes owned directly by a user. Mounted at
 * `/api/thoughts` behind `isAuth`; the app and Bourne share these routes.
 */

const router = express.Router();

const MAX_TEXT_LENGTH = 2000;

// Trimmed before it is measured, so whitespace-only text counts as empty.
const textSchema = z
    .string({ error: 'text must be a string' })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: 'text must not be empty' })
    .refine((value) => value.length <= MAX_TEXT_LENGTH, {
        message: `text must be at most ${MAX_TEXT_LENGTH} characters`,
    });

const bodySchema = z.object({ text: textSchema });

// GET /api/thoughts — the caller's thoughts, newest first.
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const thoughts = await withConnection((conn) =>
            thoughtsRepo.listByOwner(conn, req.user.id)
        );

        res.sendData({ thoughts: thoughts.map(toThought) });
    })
);

// POST /api/thoughts
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const { text } = bodySchema.parse(req.body ?? {});

        const thought = await withConnection((conn) =>
            thoughtsRepo.create(conn, { ownerId: req.user.id, text })
        );

        res.sendData(toThought(thought), 201);
    })
);

// DELETE /api/thoughts — clears the caller's thoughts only.
router.delete(
    '/',
    asyncRoute(async (req, res) => {
        const deleted = await withConnection((conn) =>
            thoughtsRepo.removeAllByOwner(conn, req.user.id)
        );

        res.sendData({ deleted });
    })
);

// PATCH /api/thoughts/:id
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const fields = bodySchema.parse(req.body ?? {});

        const thought = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'thought', id, req.user.id);

            return thoughtsRepo.update(conn, id, fields);
        });

        // The thought can vanish between the ownership check and the update.
        if (!thought) throw notFound('Thought');

        res.sendData(toThought(thought));
    })
);

// DELETE /api/thoughts/:id
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'thought', id, req.user.id);

            return thoughtsRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Thought');

        res.sendData({ id });
    })
);

module.exports = router;
