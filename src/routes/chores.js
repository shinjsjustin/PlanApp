'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const choresRepo = require('../db/repositories/choresRepo');
const { sortByUrgency } = require('../lib/choreStatus');
const choreLogsRepo = require('../db/repositories/choreLogsRepo');
const starterChores = require('../lib/starterChores');
const { conflict, notFound } = require('../lib/httpError');
const { isDateKey, localToday, timeZoneOf } = require('../lib/localDate');
const { toChore, toChoreLog } = require('../lib/serializers');
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
const MAX_DONE_BY = 50;
const DEFAULT_DONE_BY = 'Justin';
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

const doneBySchema = z
    .string({ error: 'by must be a string' })
    .trim()
    .min(1, 'by is required')
    .max(MAX_DONE_BY, `by must be at most ${MAX_DONE_BY} characters`);

// A done-mark cannot be dated after the caller's today, so the schema is built per request.
const doneOnSchema = (today) =>
    z
        .string({ error: 'on must be a date' })
        .refine(isDateKey, 'on must be a YYYY-MM-DD date')
        .refine((value) => value <= today, 'on must not be in the future');

const doneSchema = (today) => z.object({ on: doneOnSchema(today).optional(), by: doneBySchema.optional() });

const logPatchSchema = (today) =>
    doneSchema(today).refine((body) => Object.keys(body).length > 0, { message: 'at least one field is required' });

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

// POST /api/chores/seed
router.post(
    '/seed',
    asyncRoute(async (req, res) => {
        const result = await withTransaction(async (conn) => {
            const used = new Set((await choresRepo.listNamesByOwner(conn, req.user.id)).map((name) => name.trim().toLowerCase()));
            const isNew = (starter) => !used.has(starter.name.trim().toLowerCase());

            const created = [];
            for (const starter of starterChores.filter(isNew)) {
                created.push(
                    await choresRepo.create(conn, {
                        ownerId: req.user.id,
                        name: starter.name,
                        area: starter.area,
                        windowMin: starter.min,
                        windowMax: starter.max,
                    })
                );
            }

            return { created, skipped: starterChores.filter((s) => !isNew(s)).map((s) => s.name) };
        });

        const today = todayOf(req);
        res.sendData({ created: result.created.map((row) => toChore(row, today)), skipped: result.skipped });
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

// POST /api/chores/:id/done
router.post(
    '/:id/done',
    asyncRoute(async (req, res) => {
        const today = todayOf(req);
        const { on = today, by = DEFAULT_DONE_BY } = doneSchema(today).parse(req.body ?? {});

        const { log, chore } = await withOwnedChore(req, async (conn, id) => {
            const current = await choresRepo.findById(conn, id);
            if (!current) throw notFound('Chore');
            if (current.archived_at != null) throw conflict('Archived chores cannot be marked done');

            const created = await choreLogsRepo.create(conn, { choreId: id, doneOn: on, doneBy: by });

            return { log: created, chore: await choresRepo.findById(conn, id) };
        });

        res.sendData({ log: toChoreLog(log), chore: toChore(chore, today) }, 201);
    })
);

// GET /api/chores/:id/logs
router.get(
    '/:id/logs',
    asyncRoute(async (req, res) => {
        const logs = await withOwnedChore(req, (conn, id) => choreLogsRepo.listByChore(conn, id));

        res.sendData({ logs: logs.map(toChoreLog) });
    })
);

// Runs `action` on a log that must sit under the owned chore in the path.
const withOwnedLog = (req, action) => {
    const logId = parseId(req.params.logId);

    return withOwnedChore(req, async (conn, id) => {
        const log = await choreLogsRepo.findById(conn, logId);
        if (!log || log.chore_id !== id) throw notFound('Chore log');

        return { ...(await action(conn, id, logId)), chore: await choresRepo.findById(conn, id) };
    });
};

// PATCH /api/chores/:id/logs/:logId
router.patch(
    '/:id/logs/:logId',
    asyncRoute(async (req, res) => {
        const today = todayOf(req);
        const { on, by } = logPatchSchema(today).parse(req.body ?? {});
        const patch = { ...(on && { doneOn: on }), ...(by && { doneBy: by }) };

        const { log, chore } = await withOwnedLog(req, async (conn, _id, logId) => ({
            log: await choreLogsRepo.update(conn, logId, patch),
        }));

        res.sendData({ log: toChoreLog(log), chore: toChore(chore, today) });
    })
);

// DELETE /api/chores/:id/logs/:logId
router.delete(
    '/:id/logs/:logId',
    asyncRoute(async (req, res) => {
        const { logId, chore } = await withOwnedLog(req, async (conn, _id, logId) => {
            await choreLogsRepo.remove(conn, logId);

            return { logId };
        });

        res.sendData({ id: logId, chore: toChore(chore, todayOf(req)) });
    })
);

module.exports = router;
