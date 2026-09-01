'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const layersRepo = require('../db/repositories/layersRepo');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const { notFound } = require('../lib/httpError');
const { parseId, titleSchema } = require('../lib/validation');
const { toLayer, toSequence } = require('../lib/serializers');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Layer mutations (spec section 4.4). Mounted at `/api/layers` behind `isAuth`,
 * so `req.user.id` is the authenticated owner and every route runs the id it was
 * handed through `assertOwnership` first.
 *
 * Creating a layer lives on the project router instead — `POST
 * /api/projects/:id/layers` — because a new layer is addressed by the project it
 * joins, not by a layer that already exists.
 *
 * Everything here writes more than one row: a delete reindexes what is left, and
 * creating a sequence reindexes its layer. All of it runs in a transaction.
 */

const router = express.Router();

const updateLayerSchema = z.object({ title: titleSchema });

// The endpoint takes no input — the sequence it creates is untitled and goes at
// the end of the layer. Parsing an empty shape drops anything else the caller
// sent rather than letting it through unexamined.
const createSequenceSchema = z.object({});

// PATCH /api/layers/:id — rename.
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const patch = updateLayerSchema.parse(req.body ?? {});

        const layer = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'layer', id, req.user.id);

            return layersRepo.update(conn, id, patch);
        });

        if (!layer) throw notFound('Layer');

        res.sendData(toLayer(layer));
    })
);

// DELETE /api/layers/:id — takes its sequences with it. Their to-dos survive,
// unorganized (schema: `todos.sequence_id` is ON DELETE SET NULL).
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'layer', id, req.user.id);

            return layersRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Layer');

        res.sendData({ id });
    })
);

// POST /api/layers/:id/sequences — an untitled sequence at the end of the layer.
router.post(
    '/:id/sequences',
    asyncRoute(async (req, res) => {
        const layerId = parseId(req.params.id);
        createSequenceSchema.parse(req.body ?? {});

        const sequence = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'layer', layerId, req.user.id);

            return sequencesRepo.create(conn, { layerId });
        });

        res.sendData(toSequence(sequence), 201);
    })
);

module.exports = router;
