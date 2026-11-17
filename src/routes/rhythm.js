'use strict';

const express = require('express');

const asyncRoute = require('../lib/asyncRoute');
const rhythmRepo = require('../db/repositories/rhythmRepo');
const { notFound } = require('../lib/httpError');
const {
    externalIdSchema,
    anchorPutSchema,
    anchorPatchSchema,
    gatePutSchema,
    zoneSchema,
    sinceSchema,
    daysToMask,
    timeToMinutes,
    toUtcDatetime,
    toAnchor,
    toGate,
} = require('../lib/rhythm');
const { withTransaction } = require('../db/unitOfWork');

/**
 * Rhythm: anchors and gates Bourne syncs with Justin's JWT. Mounted at
 * `/api/rhythm` behind `isAuth`; every query is scoped to the caller.
 * Bourne's writes record updated_by 'bourne'; the page's PATCH records 'justin'.
 */

const RESYNC_AFTER_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BOURNE = 'bourne';

const router = express.Router();

const anchorFields = (body) => ({
    title: body.title,
    description: body.description,
    at_minutes: timeToMinutes(body.time),
    weekdays: daysToMask(body.days),
    enabled: body.enabled,
});

const gateFields = (body) => ({
    title: body.title,
    kind: body.kind,
    opens_at: toUtcDatetime(body.opensAt),
    closes_at: toUtcDatetime(body.closesAt),
    state: body.state,
    hub_url: body.hubUrl,
});

const patchFields = (patch) => ({
    ...(patch.time !== undefined && { at_minutes: timeToMinutes(patch.time) }),
    ...(patch.days !== undefined && { weekdays: daysToMask(patch.days) }),
    ...(patch.enabled !== undefined && { enabled: patch.enabled }),
});

// GET /api/rhythm
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const ownerId = req.user.id;

        const data = await withTransaction(async (conn) => ({
            timeZone: await rhythmRepo.getZone(conn, ownerId),
            anchors: (await rhythmRepo.listAnchors(conn, ownerId)).map(toAnchor),
            gates: (await rhythmRepo.listGates(conn, ownerId)).map(toGate),
        }));

        res.sendData(data);
    })
);

// GET /api/rhythm/changes?since=
router.get(
    '/changes',
    asyncRoute(async (req, res) => {
        const { since } = sinceSchema.parse(req.query);
        const ownerId = req.user.id;

        const data = await withTransaction(async (conn) => {
            const changed = await rhythmRepo.changesSince(conn, ownerId, since);
            return {
                cursor: changed.cursor,
                timeZone: await rhythmRepo.getZone(conn, ownerId),
                anchors: changed.anchors.map(toAnchor),
                gates: changed.gates.map(toGate),
                deleted: changed.deletions.map((row) => ({
                    kind: row.item_kind,
                    id: row.external_id,
                    deletedAt: row.deleted_at,
                    deletedBy: row.deleted_by,
                })),
                resync: Date.now() - Date.parse(since) > RESYNC_AFTER_DAYS * MS_PER_DAY,
            };
        });

        res.sendData(data);
    })
);

// PUT /api/rhythm/zone
router.put(
    '/zone',
    asyncRoute(async (req, res) => {
        const { timeZone } = zoneSchema.parse(req.body ?? {});

        await withTransaction((conn) => rhythmRepo.setZone(conn, req.user.id, timeZone));

        res.sendData({ timeZone });
    })
);

// PUT /api/rhythm/anchors/:id
router.put(
    '/anchors/:id',
    asyncRoute(async (req, res) => {
        const id = externalIdSchema.parse(req.params.id);
        const body = anchorPutSchema.parse(req.body ?? {});

        const result = await withTransaction(async (conn) => {
            const existing = (await rhythmRepo.listAnchors(conn, req.user.id)).some((row) => row.external_id === id);
            const row = await rhythmRepo.upsertAnchor(conn, req.user.id, id, anchorFields(body), BOURNE);
            return { anchor: toAnchor(row), created: !existing };
        });

        res.sendData(result);
    })
);

// PATCH /api/rhythm/anchors/:id
router.patch(
    '/anchors/:id',
    asyncRoute(async (req, res) => {
        const id = externalIdSchema.parse(req.params.id);
        const patch = anchorPatchSchema.parse(req.body ?? {});

        const row = await withTransaction((conn) => rhythmRepo.patchAnchor(conn, req.user.id, id, patchFields(patch)));
        if (!row) throw notFound('Anchor');

        res.sendData({ anchor: toAnchor(row) });
    })
);

// PUT /api/rhythm/gates/:id
router.put(
    '/gates/:id',
    asyncRoute(async (req, res) => {
        const id = externalIdSchema.parse(req.params.id);
        const body = gatePutSchema.parse(req.body ?? {});

        const result = await withTransaction(async (conn) => {
            const existing = (await rhythmRepo.listGates(conn, req.user.id)).some((row) => row.external_id === id);
            const row = await rhythmRepo.upsertGate(conn, req.user.id, id, gateFields(body), BOURNE);
            return { gate: toGate(row), created: !existing };
        });

        res.sendData(result);
    })
);

const deleteRoute = (kind, label) =>
    asyncRoute(async (req, res) => {
        const id = externalIdSchema.parse(req.params.id);

        const removed = await withTransaction((conn) => rhythmRepo.deleteItem(conn, req.user.id, kind, id, BOURNE));
        if (!removed) throw notFound(label);

        res.sendData({ id, deleted: true });
    });

// DELETE /api/rhythm/anchors/:id and /gates/:id
router.delete('/anchors/:id', deleteRoute('anchor', 'Anchor'));
router.delete('/gates/:id', deleteRoute('gate', 'Gate'));

module.exports = router;
