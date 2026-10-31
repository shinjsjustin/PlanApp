'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const choresRepo = require('../db/repositories/choresRepo');
const { sortByUrgency } = require('../lib/choreStatus');
const { conflict, notFound } = require('../lib/httpError');
const { localToday, timeZoneOf } = require('../lib/localDate');
const { toChore } = require('../lib/serializers');
const { parseId } = require('../lib/validation');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Chores: recurring household tasks owned by a user, each with a window of days
 * after the last time it was done. Mounted at `/api/chores` behind `isAuth`.
 */

const router = express.Router();

const MAX_NAME = 100;
const MAX_AREA = 50;
const MAX_NOTES = 2000;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

// Optional text that a blank string or null clears to null.
const clearableText = (field, max) =>
    z
        .string({ error: `${field} must be a string` })
        .trim()
        .max(max, `${field} must be at most ${max} characters`)
        .nullable()
        .transform((value) => value || null);

const dayCount = (field) =>
    z
        .number({ error: `${field} must be a number` })
        .int(`${field} must be a whole number`)
        .min(MIN_WINDOW_DAYS, `${field} must be at least ${MIN_WINDOW_DAYS}`)
        .max(MAX_WINDOW_DAYS, `${field} must be at most ${MAX_WINDOW_DAYS}`);

const windowSchema = z
    .object({ min: dayCount('min'), max: dayCount('max').optional() })
    .transform(({ min, max = min }) => ({ min, max }))
    .refine(({ min, max }) => min <= max, { message: 'window min must not exceed max' });

const fieldSchemas = {
    name: z
        .string({ error: 'name is required' })
        .trim()
        .min(1, 'name is required')
        .max(MAX_NAME, `name must be at most ${MAX_NAME} characters`),
    area: clearableText('area', MAX_AREA),
    window: windowSchema,
    notes: clearableText('notes', MAX_NOTES),
};

const createSchema = z.object({
    ...fieldSchemas,
    area: fieldSchemas.area.optional(),
    notes: fieldSchemas.notes.optional(),
});

const patchSchema = z
    .object(fieldSchemas)
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'at least one field is required' });

const listQuerySchema = z.object({
    archived: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

// Flattens the request's `window` into the repo's column-shaped fields.
const toRepoFields = ({ window, ...rest }) => ({
    ...rest,
    ...(window && { windowMin: window.min, windowMax: window.max }),
});

// Names are unique per owner, archived chores included.
const rejectDuplicate = async (action) => {
    try {
        return await action();
    } catch (error) {
        if (error.code === DUPLICATE_ENTRY) throw conflict('You already have a chore with this name');
        throw error;
    }
};

const todayOf = (req) => localToday(timeZoneOf(req));

// Loads an owned chore in a transaction, applying `action` to its id.
const withOwnedChore = (req, action) => {
    const id = parseId(req.params.id);

    return withTransaction(async (conn) => {
        await assertOwnership(conn, 'chore', id, req.user.id);

        return action(conn, id);
    });
};

const respondWithChore = (req, res, row) => {
    // The chore can vanish between the ownership check and the write.
    if (!row) throw notFound('Chore');

    res.sendData(toChore(row, todayOf(req)));
};

// GET /api/chores?archived=
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const { archived } = listQuerySchema.parse(req.query);

        const rows = await withTransaction((conn) => choresRepo.listByOwner(conn, req.user.id, { archived }));

        const today = todayOf(req);
        const chores = rows.map((row) => toChore(row, today));

        res.sendData({ chores: archived ? chores.sort((a, b) => a.name.localeCompare(b.name)) : sortByUrgency(chores) });
    })
);

// POST /api/chores
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const fields = toRepoFields(createSchema.parse(req.body ?? {}));

        const row = await rejectDuplicate(() =>
            withTransaction((conn) => choresRepo.create(conn, { ownerId: req.user.id, ...fields }))
        );

        res.sendData(toChore(row, todayOf(req)), 201);
    })
);

// GET /api/chores/:id
router.get(
    '/:id',
    asyncRoute(async (req, res) => {
        respondWithChore(req, res, await withOwnedChore(req, (conn, id) => choresRepo.findById(conn, id)));
    })
);

// PATCH /api/chores/:id
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const patch = toRepoFields(patchSchema.parse(req.body ?? {}));

        const row = await rejectDuplicate(() =>
            withOwnedChore(req, (conn, id) => choresRepo.update(conn, id, patch))
        );

        respondWithChore(req, res, row);
    })
);

// POST /api/chores/:id/archive and /:id/restore
const archiveRoute = (isArchived) =>
    asyncRoute(async (req, res) => {
        respondWithChore(req, res, await withOwnedChore(req, (conn, id) => choresRepo.setArchived(conn, id, isArchived)));
    });

router.post('/:id/archive', archiveRoute(true));
router.post('/:id/restore', archiveRoute(false));

module.exports = router;
