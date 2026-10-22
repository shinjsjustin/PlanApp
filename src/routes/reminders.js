'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const remindersRepo = require('../db/repositories/remindersRepo');
const subcategoriesRepo = require('../db/repositories/reminderSubcategoriesRepo');
const { badRequest, notFound } = require('../lib/httpError');
const { isDateKey, timeZoneOf } = require('../lib/localDate');
const { toReminder } = require('../lib/serializers');
const { parseId } = require('../lib/validation');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Reminders: owned directly by a user, optionally linked to one of their
 * places, subcategories, people, projects and to-dos. Mounted at
 * `/api/reminders` behind `isAuth`.
 */

const router = express.Router();

const MAX_TITLE = 500;
const MIN_EVERY_N_DAYS = 1;
const MAX_EVERY_N_DAYS = 365;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const idField = (field) => z.number({ error: `${field} must be a number` }).int().positive().nullable();

const repeatSchema = z.object({
    rule: z.enum(['none', 'daily', 'weekly', 'monthly', 'every_n_days']),
    every: z.number({ error: 'every must be a number' }).int().nullable().optional(),
    weekdays: z
        .array(z.enum(WEEKDAYS))
        .refine((days) => new Set(days).size === days.length, { message: 'weekdays must be unique' })
        .optional(),
});

const fieldSchemas = {
    title: z
        .string({ error: 'title is required' })
        .trim()
        .min(1, 'title is required')
        .max(MAX_TITLE, `title must be at most ${MAX_TITLE} characters`),
    placeId: idField('placeId'),
    subcategoryId: idField('subcategoryId'),
    personId: idField('personId'),
    projectId: idField('projectId'),
    todoId: idField('todoId'),
    dueDate: z.string().refine(isDateKey, 'dueDate must be YYYY-MM-DD').nullable(),
    dueTime: z.string().regex(CLOCK_TIME, 'dueTime must be HH:MM').nullable(),
    // Stored as the instant, so the offset the client sent does not matter.
    alertAt: z.iso
        .datetime({ offset: true, error: 'alertAt must be ISO 8601 with an offset' })
        .transform((value) => new Date(value))
        .nullable(),
    trigger: z.enum(['none', 'arrive', 'leave']),
    priority: z.enum(['normal', 'high']),
    repeat: repeatSchema,
};

const createSchema = z.object({
    ...fieldSchemas,
    ...Object.fromEntries(
        Object.entries(fieldSchemas)
            .filter(([key]) => key !== 'title')
            .map(([key, schema]) => [key, schema.optional()])
    ),
});

const patchSchema = z
    .object(fieldSchemas)
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'at least one field is required' });

// Flattens the request's `repeat` into the repo's column-shaped fields.
const toRepoFields = ({ repeat, ...rest }) => ({
    ...rest,
    ...(repeat && {
        repeatRule: repeat.rule,
        repeatEvery: repeat.every ?? null,
        repeatWeekdays: repeat.weekdays ?? [],
    }),
});

// The rules that span fields, checked against what the reminder will look like once saved.
const assertScheduleValid = ({ dueDate, dueTime, repeatRule, repeatEvery, repeatWeekdays }) => {
    if (dueTime && !dueDate) throw badRequest('dueTime requires dueDate');
    if (repeatRule !== 'none' && !dueDate) throw badRequest('a repeat requires dueDate');
    if (repeatRule === 'weekly' && repeatWeekdays.length === 0) {
        throw badRequest('a weekly repeat requires weekdays');
    }
    if (
        repeatRule === 'every_n_days' &&
        !(repeatEvery >= MIN_EVERY_N_DAYS && repeatEvery <= MAX_EVERY_N_DAYS)
    ) {
        throw badRequest(`every must be ${MIN_EVERY_N_DAYS}-${MAX_EVERY_N_DAYS} for every_n_days`);
    }
};

const scheduleOf = (row) => {
    const { dueDate, dueTime, repeat } = toReminder(row);

    return { dueDate, dueTime, repeatRule: repeat.rule, repeatEvery: repeat.every, repeatWeekdays: repeat.weekdays };
};

const OWNED_LINKS = [
    ['placeId', 'place'],
    ['personId', 'person'],
    ['projectId', 'project'],
    ['todoId', 'todo'],
    ['subcategoryId', 'reminderSubcategory'],
];

// Every link being set must belong to the caller.
const assertLinksOwned = async (conn, fields, userId) => {
    for (const [field, type] of OWNED_LINKS) {
        if (fields[field] != null) await assertOwnership(conn, type, fields[field], userId);
    }
};

// A subcategory is only meaningful under the place it belongs to.
const assertSubcategoryFits = async (conn, subcategoryId, placeId) => {
    if (subcategoryId == null) return;
    if (placeId == null) throw badRequest('subcategoryId requires a placeId');

    const subcategory = await subcategoriesRepo.findById(conn, subcategoryId);
    if (subcategory.place_id !== placeId) throw badRequest('subcategory does not belong to this place');
};

const listQuerySchema = z.object({
    placeId: z
        .union([z.literal('none'), z.string().regex(/^[1-9]\d*$/, 'placeId must be a positive integer or none').transform(Number)])
        .optional(),
    status: z.enum(['open', 'history', 'all']).default('open'),
    sort: z.enum(['due', 'place', 'subcategory', 'created']).default('due'),
});

// GET /api/reminders?placeId=&status=&sort=
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const filters = listQuerySchema.parse(req.query);

        const rows = await withTransaction((conn) => remindersRepo.listByOwner(conn, req.user.id, filters));

        res.sendData({ reminders: rows.map(toReminder) });
    })
);

// POST /api/reminders
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const fields = toRepoFields(createSchema.parse(req.body ?? {}));
        assertScheduleValid({ repeatRule: 'none', repeatWeekdays: [], ...fields });

        const reminder = await withTransaction(async (conn) => {
            await assertLinksOwned(conn, fields, req.user.id);
            await assertSubcategoryFits(conn, fields.subcategoryId, fields.placeId);

            return remindersRepo.create(conn, { ownerId: req.user.id, timeZone: timeZoneOf(req), ...fields });
        });

        res.sendData(toReminder(reminder), 201);
    })
);

// GET /api/reminders/:id
router.get(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const reminder = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'reminder', id, req.user.id);

            return remindersRepo.findById(conn, id);
        });

        if (!reminder) throw notFound('Reminder');

        res.sendData(toReminder(reminder));
    })
);

// PATCH /api/reminders/:id
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const patch = toRepoFields(patchSchema.parse(req.body ?? {}));

        const reminder = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'reminder', id, req.user.id);
            await assertLinksOwned(conn, patch, req.user.id);

            const current = await remindersRepo.findById(conn, id);
            if (!current) throw notFound('Reminder');

            assertScheduleValid({ ...scheduleOf(current), ...patch });

            const placeId = patch.placeId === undefined ? current.place_id : patch.placeId;
            const fields = { ...patch };
            if (patch.subcategoryId === undefined && current.subcategory_id != null) {
                const subcategory = await subcategoriesRepo.findById(conn, current.subcategory_id);
                if (subcategory?.place_id !== placeId) fields.subcategoryId = null;
            }
            await assertSubcategoryFits(conn, fields.subcategoryId, placeId);

            return remindersRepo.update(conn, id, fields);
        });

        // The reminder can vanish between the ownership check and the update.
        if (!reminder) throw notFound('Reminder');

        res.sendData(toReminder(reminder));
    })
);

// DELETE /api/reminders/:id
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'reminder', id, req.user.id);

            return remindersRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Reminder');

        res.sendData({ id });
    })
);

module.exports = router;
