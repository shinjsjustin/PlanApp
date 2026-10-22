'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const repo = require('../db/repositories/deviceTokensRepo');
const { notFound } = require('../lib/httpError');
const { withConnection } = require('../db/unitOfWork');

/**
 * Per-device tokens for Shortcuts, so they never hold the password or a JWT.
 * Mounted at `/api/device-tokens` behind `isAuth`.
 */

const router = express.Router();

// Column width in device_tokens.name.
const MAX_NAME = 100;

const createSchema = z.object({
    name: z
        .string({ error: 'name is required' })
        .min(1, 'name is required')
        .max(MAX_NAME, `name must be at most ${MAX_NAME} characters`),
});

// created_at is a timestamp, which the driver reads correctly; last_used_at is UTC wall time read as local.
const toUtcInstant = (date) =>
    new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()));

// GET /api/device-tokens
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const rows = await withConnection((conn) => repo.listByOwner(conn, req.user.id));

        res.sendData(
            rows.map((row) => ({
                id: row.id,
                name: row.name,
                lastUsedAt: row.last_used_at && toUtcInstant(row.last_used_at).toISOString(),
                createdAt: row.created_at.toISOString(),
            }))
        );
    })
);

// POST /api/device-tokens
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const { name } = createSchema.parse(req.body ?? {});

        const row = await withConnection((conn) => repo.create(conn, { ownerId: req.user.id, name }));

        res.sendData({ id: row.id, name: row.name, token: row.token, createdAt: row.created_at.toISOString() }, 201);
    })
);

// DELETE /api/device-tokens/:id
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = Number(req.params.id);
        const removed = Number.isInteger(id) && (await withConnection((conn) => repo.removeForOwner(conn, req.user.id, id)));
        if (!removed) throw notFound('Device token');

        res.sendData({ id });
    })
);

module.exports = router;
