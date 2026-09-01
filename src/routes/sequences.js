'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const { notFound } = require('../lib/httpError');
const { descriptionSchema, parseId, requireSomeField, titleSchema } = require('../lib/validation');
const { toSequence } = require('../lib/serializers');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Sequence mutations (spec section 4.4). Mounted at `/api/sequences` behind
 * `isAuth`; creating one lives on the layer router, since a new sequence is
 * addressed by the layer it joins.
 *
 * `isBlocked` is the only piece of a sequence's status that is stored. The rest
 * is derived from its to-dos on the client (spec section 4.3), so there is
 * nothing else here to keep in step.
 *
 * `isCollapsed` is patched through the same route, which is why the handler is
 * one PATCH rather than a verb per field: folding a card is a change to the
 * sequence like any other, and it travels on the same optimistic path.
 */

const router = express.Router();

const PATCHABLE_FIELDS = ['title', 'description', 'isBlocked', 'isCollapsed'];

const updateSequenceSchema = requireSomeField(
    z.object({
        title: titleSchema.optional(),
        description: descriptionSchema.optional(),
        isBlocked: z.boolean().optional(),
        isCollapsed: z.boolean().optional(),
    }),
    PATCHABLE_FIELDS
);

// PATCH /api/sequences/:id — rename, re-describe, set the blocked override, or
// fold the card shut.
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const patch = updateSequenceSchema.parse(req.body ?? {});

        const sequence = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'sequence', id, req.user.id);

            return sequencesRepo.update(conn, id, patch);
        });

        if (!sequence) throw notFound('Sequence');

        res.sendData(toSequence(sequence));
    })
);

// DELETE /api/sequences/:id — the to-dos filed in it are not destroyed. They
// return to the unorganized panel, and both lists are reindexed by the
// repository (see the note on `sequencesRepo.remove`).
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'sequence', id, req.user.id);

            return sequencesRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Sequence');

        res.sendData({ id });
    })
);

module.exports = router;
