'use strict';

const express = require('express');

const asyncRoute = require('../lib/asyncRoute');
const livedMomentsRepo = require('../db/repositories/livedMomentsRepo');
const { daySchema, dateParamSchema, rangeSchema, toLivedMoment } = require('../lib/livedMoments');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Lived moments: what actually happened, rebuilt a whole day at a time.
 * Mounted at `/api/lived` behind `isAuth`; every query is scoped to the caller.
 */

const router = express.Router();

// GET /api/lived?from=&to=
router.get(
    '/',
    asyncRoute(async (req, res) => {
        // rangeSchema's cross-field checks run even when a date is malformed and then throw,
        // so each date is checked on its own first.
        dateParamSchema.parse(req.query.from);
        dateParamSchema.parse(req.query.to);
        const { from, to } = rangeSchema.parse(req.query);

        const rows = await withTransaction((conn) => livedMomentsRepo.listRange(conn, req.user.id, from, to));

        res.sendData({ moments: rows.map(toLivedMoment) });
    })
);

// PUT /api/lived/days/:date
router.put(
    '/days/:date',
    asyncRoute(async (req, res) => {
        const date = dateParamSchema.parse(req.params.date);
        const { moments } = daySchema.parse(req.body ?? {});

        const rows = await withTransaction((conn) => livedMomentsRepo.replaceDay(conn, req.user.id, date, moments));

        res.sendData({ date, moments: rows.map(toLivedMoment) });
    })
);

// DELETE /api/lived/days/:date
router.delete(
    '/days/:date',
    asyncRoute(async (req, res) => {
        const date = dateParamSchema.parse(req.params.date);

        const deleted = await withTransaction((conn) => livedMomentsRepo.clearDay(conn, req.user.id, date));

        res.sendData({ date, deleted });
    })
);

module.exports = router;
