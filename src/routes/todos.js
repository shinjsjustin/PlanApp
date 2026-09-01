'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const assertSequenceInProject = require('../lib/assertSequenceInProject');
const todosRepo = require('../db/repositories/todosRepo');
const { badRequest, notFound } = require('../lib/httpError');
const { toTodo } = require('../lib/serializers');
const {
    idSchema,
    parseId,
    requireSomeField,
    todoStatusSchema,
    todoTextSchema,
} = require('../lib/validation');
const { withTransaction } = require('../db/unitOfWork');

/**
 * To-do mutations (spec section 4.4). Mounted at `/api/todos` behind `isAuth`;
 * creating one lives on the project router, since a new to-do is addressed by
 * the project it joins rather than by a to-do that already exists.
 *
 * The idea the whole file rests on: `sequence_id IS NULL` is not a missing
 * value, it is the unorganized panel. That makes the panel an ordered list like
 * any other, which is why one move endpoint covers filing a to-do into a
 * sequence, reordering it there, and sending it back out again.
 */

const router = express.Router();

const PATCHABLE_FIELDS = ['text', 'status'];

const updateTodoSchema = requireSomeField(
    z.object({
        text: todoTextSchema.optional(),
        status: todoStatusSchema.optional(),
    }),
    PATCHABLE_FIELDS
);

/**
 * `sequenceId` is required rather than optional, even though null is a legal
 * value: a body that simply left it out must not be read as "unorganize this",
 * which would quietly pull a to-do out of the sequence it was filed in.
 */
const moveTodoSchema = z.object({
    sequenceId: idSchema.nullable(),
    position: z
        .number({ error: 'position must be an integer of 0 or more' })
        .int('position must be an integer of 0 or more')
        .min(0, 'position must be an integer of 0 or more'),
});

/**
 * `position` is checked against the target list by the reindexing helpers, which
 * raise a `RangeError` for an index outside it. That is a caller mistake — a
 * stale client naming a slot in a list that has since shrunk — so it answers 400
 * here rather than reaching the error handler as a server fault.
 *
 * The repository validates the index before writing anything and the whole move
 * runs in a transaction, so a rejected move leaves both lists untouched.
 */
const moveOrReject = async (conn, id, placement) => {
    try {
        return await todosRepo.move(conn, id, placement);
    } catch (err) {
        if (err instanceof RangeError) throw badRequest(`position: ${err.message}`);

        throw err;
    }
};

// PATCH /api/todos/:id — reword it, or tick it complete or blocked. Nothing has
// to be re-derived afterwards: a sequence's status is computed from its to-dos
// on every render, so there is no stored status to keep in step (spec 4.3).
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const patch = updateTodoSchema.parse(req.body ?? {});

        const todo = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'todo', id, req.user.id);

            return todosRepo.update(conn, id, patch);
        });

        if (!todo) throw notFound('To-do');

        res.sendData(toTodo(todo));
    })
);

// PUT /api/todos/:id/move — put this to-do at this position in this list.
// Filing one in, reordering it, and sending it back to the unorganized panel are
// the same operation over two ordered lists, so they are one endpoint. Both the
// source and the destination are reindexed inside a single transaction.
router.put(
    '/:id/move',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const { sequenceId, position } = moveTodoSchema.parse(req.body ?? {});

        const todo = await withTransaction(async (conn) => {
            const project = await assertOwnership(conn, 'todo', id, req.user.id);

            if (sequenceId !== null) {
                await assertSequenceInProject(conn, sequenceId, project.id, req.user.id);
            }

            return moveOrReject(conn, id, { sequenceId, position });
        });

        if (!todo) throw notFound('To-do');

        res.sendData(toTodo(todo));
    })
);

// DELETE /api/todos/:id — closes the gap it leaves in whichever list held it.
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'todo', id, req.user.id);

            return todosRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('To-do');

        res.sendData({ id });
    })
);

module.exports = router;
