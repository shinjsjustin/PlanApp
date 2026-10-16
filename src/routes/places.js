'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const placesRepo = require('../db/repositories/placesRepo');
const { notFound } = require('../lib/httpError');
const { toPlace } = require('../lib/serializers');
const { placesPayload } = require('../lib/startPlace');
const { parseId } = require('../lib/validation');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Places: saved locations owned directly by a user. Mounted at `/api/places`
 * behind `isAuth`.
 */

const router = express.Router();

const PLACE_KINDS = ['home', 'work', 'client', 'church', 'supplier', 'person', 'other'];
// Bookings are slot-aligned, so visits run in half-hour steps.
const VISIT_STEP_MINUTES = 30;
const MIN_VISIT_MINUTES = 30;
const MAX_VISIT_MINUTES = 720;

const requiredText = (field, maxLength) =>
    z
        .string({ error: `${field} must be a string` })
        .trim()
        .min(1, `${field} must not be empty`)
        .max(maxLength, `${field} must be at most ${maxLength} characters`);

const visitMinutesSchema = z
    .number({ error: 'visitMinutes must be a number' })
    .int()
    .min(MIN_VISIT_MINUTES)
    .max(MAX_VISIT_MINUTES)
    .refine((value) => value % VISIT_STEP_MINUTES === 0, {
        message: `visitMinutes must be a multiple of ${VISIT_STEP_MINUTES}`,
    })
    .nullable();

const fieldSchemas = {
    name: requiredText('name', 255),
    address: requiredText('address', 500),
    kind: z.enum(PLACE_KINDS),
    notes: z.string().nullable(),
    visitMinutes: visitMinutesSchema,
};

const createSchema = z.object({
    name: fieldSchemas.name,
    address: fieldSchemas.address,
    kind: fieldSchemas.kind.optional(),
    notes: fieldSchemas.notes.optional(),
    visitMinutes: fieldSchemas.visitMinutes.optional(),
});

const patchSchema = z
    .object({
        name: fieldSchemas.name,
        address: fieldSchemas.address,
        kind: fieldSchemas.kind,
        notes: fieldSchemas.notes,
        visitMinutes: fieldSchemas.visitMinutes,
        isDefaultStart: z.boolean(),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'at least one field is required' });

// GET /api/places — the caller's places and where their day starts.
router.get(
    '/',
    asyncRoute(async (req, res) => {
        res.sendData(await placesPayload(req.user.id));
    })
);

// POST /api/places
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const fields = createSchema.parse(req.body ?? {});

        const place = await withTransaction((conn) =>
            placesRepo.create(conn, { ownerId: req.user.id, ...fields })
        );

        res.sendData(toPlace(place), 201);
    })
);

// PATCH /api/places/:id
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const { isDefaultStart, ...fields } = patchSchema.parse(req.body ?? {});

        const place = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'place', id, req.user.id);

            if (Object.keys(fields).length > 0) await placesRepo.update(conn, id, fields);
            if (isDefaultStart !== undefined) {
                await placesRepo.setDefaultStart(conn, req.user.id, isDefaultStart ? id : null);
            }

            return placesRepo.findById(conn, id);
        });

        // The place can vanish between the ownership check and the update.
        if (!place) throw notFound('Place');

        res.sendData(toPlace(place));
    })
);

// DELETE /api/places/:id
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'place', id, req.user.id);

            return placesRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Place');

        res.sendData({ id });
    })
);

module.exports = router;
