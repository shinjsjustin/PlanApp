'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const peopleRepo = require('../db/repositories/peopleRepo');
const { notFound } = require('../lib/httpError');
const { toPerson } = require('../lib/serializers');
const { parseId } = require('../lib/validation');
const { withTransaction } = require('../db/unitOfWork');

/**
 * People: contacts owned directly by a user, optionally linked to one of their
 * places. Mounted at `/api/people` behind `isAuth`. Emails are never checked
 * for uniqueness; people are separate.
 */

const router = express.Router();

const CONTACT_GROUPS = ['family', 'friend', 'client_contact', 'supplier', 'church', 'other'];
const MAX_LIST_ITEMS = 10;
const MAX_TEXT = 255;
const MAX_PHONE_LABEL = 40;
const MAX_PHONE_NUMBER = 50;
const MAX_NOTES = 5000;
const MAX_LEEMAC_CLIENT_ID = 64;
// The column is an unsigned int, so anything but digits would fail as a 500.
const DIGITS = /^\d{1,10}$/;

const text = (field, maxLength) =>
    z
        .string({ error: `${field} must be a string` })
        .trim()
        .max(maxLength, `${field} must be at most ${maxLength} characters`);

const requiredText = (field, maxLength) => text(field, maxLength).min(1, `${field} must not be empty`);

const phoneSchema = z.object({
    label: text('label', MAX_PHONE_LABEL),
    number: requiredText('number', MAX_PHONE_NUMBER),
});

const fieldSchemas = {
    name: requiredText('name', MAX_TEXT),
    company: text('company', MAX_TEXT).nullable(),
    role: text('role', MAX_TEXT).nullable(),
    emails: z.array(text('email', MAX_TEXT).email('email must be valid')).max(MAX_LIST_ITEMS),
    phones: z.array(phoneSchema).max(MAX_LIST_ITEMS),
    groups: z
        .array(z.enum(CONTACT_GROUPS))
        .refine((groups) => new Set(groups).size === groups.length, { message: 'groups must be unique' }),
    notes: z.string({ error: 'notes must be a string' }).max(MAX_NOTES).nullable(),
    placeId: z.number({ error: 'placeId must be a number' }).int().positive().nullable(),
    leemacClientId: text('leemacClientId', MAX_LEEMAC_CLIENT_ID)
        .regex(DIGITS, 'leemacClientId must be digits')
        .nullable(),
    leemacClientName: text('leemacClientName', MAX_TEXT).nullable(),
};

const createSchema = z.object({
    ...fieldSchemas,
    ...Object.fromEntries(
        Object.entries(fieldSchemas)
            .filter(([key]) => key !== 'name')
            .map(([key, schema]) => [key, schema.optional()])
    ),
});

const patchSchema = z
    .object(fieldSchemas)
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'at least one field is required' });

// A linked place must belong to the caller too.
const assertPlaceOwned = (conn, placeId, userId) =>
    placeId == null ? undefined : assertOwnership(conn, 'place', placeId, userId);

// GET /api/people
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const rows = await withTransaction((conn) => peopleRepo.listByOwner(conn, req.user.id));

        res.sendData({ people: rows.map(toPerson) });
    })
);

// GET /api/people/:id
router.get(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const person = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'person', id, req.user.id);

            return peopleRepo.findById(conn, id);
        });

        if (!person) throw notFound('Person');

        res.sendData(toPerson(person));
    })
);

// POST /api/people
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const fields = createSchema.parse(req.body ?? {});

        const person = await withTransaction(async (conn) => {
            await assertPlaceOwned(conn, fields.placeId, req.user.id);

            return peopleRepo.create(conn, { ownerId: req.user.id, ...fields });
        });

        res.sendData(toPerson(person), 201);
    })
);

// PATCH /api/people/:id
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const fields = patchSchema.parse(req.body ?? {});

        const person = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'person', id, req.user.id);
            await assertPlaceOwned(conn, fields.placeId, req.user.id);

            return peopleRepo.update(conn, id, fields);
        });

        // The person can vanish between the ownership check and the update.
        if (!person) throw notFound('Person');

        res.sendData(toPerson(person));
    })
);

// DELETE /api/people/:id
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'person', id, req.user.id);

            return peopleRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Person');

        res.sendData({ id });
    })
);

module.exports = router;
