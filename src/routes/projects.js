'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const assertSequenceInProject = require('../lib/assertSequenceInProject');
const layersRepo = require('../db/repositories/layersRepo');
const projectsRepo = require('../db/repositories/projectsRepo');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const todosRepo = require('../db/repositories/todosRepo');
const { badRequest, notFound } = require('../lib/httpError');
const {
    findProjectWithFrontier,
    listProjectsWithFrontier,
} = require('../lib/projectsFrontier');
const { toLayer, toProject, toSequence, toTodo } = require('../lib/serializers');
const {
    descriptionSchema,
    idSchema,
    parseId,
    requireSomeField,
    titleSchema,
    todoTextSchema,
} = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * Project CRUD (spec section 4.4). Mounted behind `isAuth`, so `req.user.id` is
 * always the authenticated owner; every route that takes an id runs it through
 * `assertOwnership` before touching the row.
 *
 * `GET /:id` returns the whole graph in one payload; `GET /` returns the list
 * with each project's ready frontier, batched in `lib/projectsFrontier.js`.
 */

const router = express.Router();

const PATCHABLE_FIELDS = ['title', 'description'];

const createProjectSchema = z.object({
    title: titleSchema,
    description: descriptionSchema.optional(),
});

const updateProjectSchema = requireSomeField(
    z.object({
        title: titleSchema.optional(),
        description: descriptionSchema.optional(),
    }),
    PATCHABLE_FIELDS
);

// An absent or null `afterLayerId` appends; a present one inserts directly
// below that layer. Both shapes are legal, so neither is an error here — the
// route checks separately that the layer named is one of this project's.
const createLayerSchema = z.object({ afterLayerId: idSchema.nullish() });

// An absent or null `sequenceId` means the unorganized panel — the to-do exists
// in the project but is not filed anywhere yet (spec section 4.2).
const createTodoSchema = z.object({
    text: todoTextSchema,
    sequenceId: idSchema.nullish(),
});

// GET /api/projects — the caller's projects, each with its to-do progress and
// its ready frontier, from one batched set of queries (see projectsFrontier).
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const projects = await withConnection((conn) =>
            listProjectsWithFrontier(conn, req.user.id)
        );

        res.sendData(projects);
    })
);

// POST /api/projects — the project and its first layer are one atomic unit: a
// project with no layer has nowhere to put a sequence.
//
// It answers in the list's shape, frontier and all, so the home page can prepend
// the response to the grid without a second round trip.
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const { title, description } = createProjectSchema.parse(req.body ?? {});

        const project = await withTransaction(async (conn) => {
            const created = await projectsRepo.create(conn, {
                ownerId: req.user.id,
                title,
                description: description ?? null,
            });

            await layersRepo.create(conn, { projectId: created.id });

            return findProjectWithFrontier(conn, created.id);
        });

        res.sendData(project, 201);
    })
);

/**
 * Everything the project page needs, in one payload (spec section 4.4).
 *
 * Four queries, each covering a whole collection — never one per layer or one
 * per sequence. They run in sequence rather than through `Promise.all` because a
 * single mysql2 connection executes one statement at a time.
 *
 * Returns null when the project is gone, so the caller decides the status code.
 */
const loadProjectGraph = async (conn, id) => {
    const project = await projectsRepo.findByIdWithCounts(conn, id);
    if (!project) return null;

    const layers = await layersRepo.listByProject(conn, id);
    const sequences = await sequencesRepo.listByProject(conn, id);
    const todos = await todosRepo.listByProject(conn, id);

    return {
        project: toProject(project),
        layers: layers.map(toLayer),
        sequences: sequences.map(toSequence),
        todos: todos.map(toTodo),
    };
};

// GET /api/projects/:id — the full graph.
router.get(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const graph = await withConnection(async (conn) => {
            await assertOwnership(conn, 'project', id, req.user.id);

            return loadProjectGraph(conn, id);
        });

        if (!graph) throw notFound('Project');

        res.sendData(graph);
    })
);

// PATCH /api/projects/:id — also in the list's shape, so a rename replaces the
// card in the grid without dropping the frontier the title change cannot affect.
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const patch = updateProjectSchema.parse(req.body ?? {});

        const project = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'project', id, req.user.id);
            await projectsRepo.update(conn, id, patch);

            return findProjectWithFrontier(conn, id);
        });

        if (!project) throw notFound('Project');

        res.sendData(project);
    })
);

/**
 * POST /api/projects/:id/layers — appends a layer, or inserts one directly below
 * `afterLayerId`, reindexing every layer beneath it in the same transaction.
 *
 * The named layer is checked twice on purpose: `assertOwnership` answers "is it
 * yours" (403/404), and the project comparison answers "is it this project's"
 * (400). A layer the caller owns but which sits in another project is a client
 * bug, not an authorisation failure, and it must not append silently.
 */
router.post(
    '/:id/layers',
    asyncRoute(async (req, res) => {
        const projectId = parseId(req.params.id);
        const { afterLayerId = null } = createLayerSchema.parse(req.body ?? {});

        const layer = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'project', projectId, req.user.id);

            if (afterLayerId !== null) {
                await assertOwnership(conn, 'layer', afterLayerId, req.user.id);

                const after = await layersRepo.findById(conn, afterLayerId);
                if (after.project_id !== projectId) {
                    throw badRequest(`afterLayerId: layer ${afterLayerId} is not in this project`);
                }
            }

            return layersRepo.create(conn, { projectId, afterLayerId });
        });

        res.sendData(toLayer(layer), 201);
    })
);

/**
 * POST /api/projects/:id/todos — appends a to-do to the end of its list: a
 * sequence, or the unorganized panel when no sequence is named.
 *
 * The panel is a filter over this project's to-dos rather than a collection of
 * its own, so both cases are the same insert with a different `sequence_id`.
 * A sequence in another project is refused: filing work somewhere the user did
 * not point at would be worse than saying no.
 */
router.post(
    '/:id/todos',
    asyncRoute(async (req, res) => {
        const projectId = parseId(req.params.id);
        const { text, sequenceId = null } = createTodoSchema.parse(req.body ?? {});

        const todo = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'project', projectId, req.user.id);

            if (sequenceId !== null) {
                await assertSequenceInProject(conn, sequenceId, projectId, req.user.id);
            }

            return todosRepo.create(conn, { projectId, text, sequenceId });
        });

        res.sendData(toTodo(todo), 201);
    })
);

// DELETE /api/projects/:id — cascades through layers, sequences and to-dos, so
// it runs in a transaction (see the note in projectsRepo.remove).
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'project', id, req.user.id);

            return projectsRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Project');

        res.sendData({ id });
    })
);

module.exports = router;
