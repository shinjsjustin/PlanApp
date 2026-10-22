'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const subcategoriesRepo = require('../db/repositories/reminderSubcategoriesRepo');
const { conflict, notFound } = require('../lib/httpError');
const { toReminderSubcategory } = require('../lib/serializers');
const { parseId } = require('../lib/validation');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Reminder subcategories: names that belong to one of the caller's places.
 * Mounted at `/api/reminder-subcategories` behind `isAuth`.
 */

const router = express.Router();

const MAX_NAME = 100;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

const nameSchema = z
    .string({ error: 'name must be a string' })
    .trim()
    .min(1, 'name must not be empty')
    .max(MAX_NAME, `name must be at most ${MAX_NAME} characters`);

const idSchema = (field) => z.coerce.number({ error: `${field} must be a number` }).int().positive();

const listQuerySchema = z.object({ placeId: idSchema('placeId').optional() });
const createSchema = z.object({ placeId: idSchema('placeId'), name: nameSchema });
const patchSchema = z.object({ name: nameSchema });

// A name may only appear once per place.
const rejectDuplicate = async (action) => {
    try {
        return await action();
    } catch (error) {
        if (error.code === DUPLICATE_ENTRY) throw conflict('That place already has a subcategory with this name');
        throw error;
    }
};

// GET /api/reminder-subcategories?placeId=
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const options = listQuerySchema.parse(req.query);
        const rows = await withTransaction((conn) => subcategoriesRepo.listByOwner(conn, req.user.id, options));

        res.sendData({ subcategories: rows.map(toReminderSubcategory) });
    })
);

// POST /api/reminder-subcategories
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const { placeId, name } = createSchema.parse(req.body ?? {});

        const row = await rejectDuplicate(() =>
            withTransaction(async (conn) => {
                await assertOwnership(conn, 'place', placeId, req.user.id);

                return subcategoriesRepo.create(conn, { ownerId: req.user.id, placeId, name });
            })
        );

        res.sendData(toReminderSubcategory(row), 201);
    })
);

// PATCH /api/reminder-subcategories/:id
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const { name } = patchSchema.parse(req.body ?? {});

        const row = await rejectDuplicate(() =>
            withTransaction(async (conn) => {
                await assertOwnership(conn, 'reminderSubcategory', id, req.user.id);

                return subcategoriesRepo.rename(conn, id, name);
            })
        );

        if (!row) throw notFound('Subcategory');

        res.sendData(toReminderSubcategory(row));
    })
);

// DELETE /api/reminder-subcategories/:id
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'reminderSubcategory', id, req.user.id);

            return subcategoriesRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Subcategory');

        res.sendData({ id });
    })
);

module.exports = router;
