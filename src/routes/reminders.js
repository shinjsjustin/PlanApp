'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const remindersRepo = require('../db/repositories/remindersRepo');
const subcategoriesRepo = require('../db/repositories/reminderSubcategoriesRepo');
const { badRequest, conflict, notFound } = require('../lib/httpError');
const { isDateKey, timeZoneOf } = require('../lib/localDate');
const { nextDueDate, shiftAlert } = require('../lib/reminderSchedule');
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

// Loads an owned reminder and requires it to be in one of the given statuses.
const loadInStatus = async (conn, id, userId, allowed) => {
    await assertOwnership(conn, 'reminder', id, userId);

    const reminder = await remindersRepo.findById(conn, id);
    if (!reminder) throw notFound('Reminder');
    if (!allowed.includes(reminder.status)) throw conflict(`Reminder is ${reminder.status}`);

    return reminder;
};

// The copy a done repeating reminder leaves behind, or null when the rule has no next date.
const createNext = async (conn, closed) => {
    const { dueDate, dueTime, repeat } = toReminder(closed);
    if (repeat.rule === 'none') return null;

    const nextDate = nextDueDate({ dueDate, rule: repeat.rule, every: repeat.every, weekdays: repeat.weekdays });
    if (!nextDate) return null;

    const alertAt = closed.alert_at
        ? shiftAlert(new Date(closed.alert_at), dueDate, nextDate, closed.time_zone)
        : null;

    return remindersRepo.create(conn, {
        ownerId: closed.owner_id,
        title: closed.title,
        placeId: closed.place_id,
        subcategoryId: closed.subcategory_id,
        personId: closed.person_id,
        projectId: closed.project_id,
        todoId: closed.todo_id,
        dueDate: nextDate,
        dueTime,
        timeZone: closed.time_zone,
        alertAt,
        trigger: closed.location_trigger,
        priority: closed.priority,
        repeatRule: repeat.rule,
        repeatEvery: repeat.every,
        repeatWeekdays: repeat.weekdays,
        repeatedFromId: closed.id,
    });
};

const closeRoute = (status) =>
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const { closed, next } = await withTransaction(async (conn) => {
            await loadInStatus(conn, id, req.user.id, ['open']);
            const closedRow = await remindersRepo.close(conn, id, status);

            return { closed: closedRow, next: status === 'done' ? await createNext(conn, closedRow) : null };
        });

        res.sendData({ reminder: toReminder(closed), next: next && toReminder(next) });
    });

// POST /api/reminders/:id/done and /:id/dismiss
router.post('/:id/done', closeRoute('done'));
router.post('/:id/dismiss', closeRoute('dismissed'));

const snoozeSchema = z.object({
    until: z.iso
        .datetime({ offset: true, error: 'until must be ISO 8601 with an offset' })
        .transform((value) => new Date(value)),
});

// POST /api/reminders/:id/snooze
router.post(
    '/:id/snooze',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const { until } = snoozeSchema.parse(req.body ?? {});
        if (until <= new Date()) throw badRequest('until must be in the future');

        const reminder = await withTransaction(async (conn) => {
            await loadInStatus(conn, id, req.user.id, ['open']);

            return remindersRepo.update(conn, id, { snoozedUntil: until });
        });

        res.sendData(toReminder(reminder));
    })
);

// POST /api/reminders/:id/reopen
router.post(
    '/:id/reopen',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const reminder = await withTransaction(async (conn) => {
            await loadInStatus(conn, id, req.user.id, ['done', 'dismissed']);

            return remindersRepo.update(conn, id, { status: 'open', closedAt: null });
        });

        res.sendData(toReminder(reminder));
    })
);

module.exports = router;
