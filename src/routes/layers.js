'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const layersRepo = require('../db/repositories/layersRepo');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const { notFound } = require('../lib/httpError');
const { parseId, titleSchema, planSchemaTextSchema } = require('../lib/validation');
const { toLayer, toSequence, toTodo } = require('../lib/serializers');
const { parsePlanSchema } = require('../lib/planSchema');
const { writeImportedPlan } = require('../lib/importPlan');
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

const importSequencesSchema = z.object({ schema: planSchemaTextSchema });

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

// POST /api/layers/:id/sequences/import — appends the schema's sequences and
// their to-dos to the layer; loose to-dos go to Unorganized. A leading "##" line
// is accepted but the layer's title is left alone. All or nothing.
router.post(
    '/:id/sequences/import',
    asyncRoute(async (req, res) => {
        const layerId = parseId(req.params.id);
        const { schema } = importSequencesSchema.parse(req.body ?? {});
        const parsed = parsePlanSchema(schema, { mode: 'sequences' });

        const { sequences, todos } = await withTransaction(async (conn) => {
            const project = await assertOwnership(conn, 'layer', layerId, req.user.id);

            return writeImportedPlan(conn, { projectId: project.id, layerId, parsed });
        });

        res.sendData({ sequences: sequences.map(toSequence), todos: todos.map(toTodo) }, 201);
    })
);

module.exports = router;
