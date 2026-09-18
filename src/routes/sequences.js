'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertLayerInProject = require('../lib/assertLayerInProject');
const assertOwnership = require('../middleware/assertOwnership');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const { badRequest, notFound } = require('../lib/httpError');
const {
    descriptionSchema,
    idSchema,
    parseId,
    requireSomeField,
    titleSchema,
} = require('../lib/validation');
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
 *
 * `PUT /:id/move` is the exception to "one PATCH": a placement is not a field
 * edit. It replaces where the sequence lives outright and touches two ordered
 * lists, which is more than a partial update should ever mean.
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

/**
 * `layerId` is required rather than optional: a body that simply left it out
 * must not be read as "stay where you are", which would turn a mis-sent move
 * into a silent reorder of a layer the caller never named.
 */
const moveSequenceSchema = z.object({
    layerId: idSchema,
    position: z
        .number({ error: 'position must be an integer of 0 or more' })
        .int('position must be an integer of 0 or more')
        .min(0, 'position must be an integer of 0 or more'),
});

/**
 * `position` is checked against the target layer by the reindexing helpers,
 * which raise a `RangeError` for an index outside it. That is a caller mistake —
 * a stale client naming a slot in a layer that has since shrunk — so it answers
 * 400 here rather than reaching the error handler as a server fault.
 */
const moveOrReject = async (conn, id, placement) => {
    try {
        return await sequencesRepo.move(conn, id, placement);
    } catch (err) {
        if (err instanceof RangeError) throw badRequest(`position: ${err.message}`);

        throw err;
    }
};

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

// PUT /api/sequences/:id/move — put this sequence at this position in this
// layer. Reordering a sequence within its band and moving it to another are the
// same operation over one or two ordered lists, so they are one endpoint.
//
// Both lists are reindexed inside the same transaction, so a move is never
// visible as a hole in the layer it left or a collision in the one it joined.
router.put(
    '/:id/move',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const { layerId, position } = moveSequenceSchema.parse(req.body ?? {});

        const sequence = await withTransaction(async (conn) => {
            const project = await assertOwnership(conn, 'sequence', id, req.user.id);

            await assertLayerInProject(conn, layerId, project.id, req.user.id);

            return moveOrReject(conn, id, { layerId, position });
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
