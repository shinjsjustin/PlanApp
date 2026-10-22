'use strict';

const sendsRepo = require('../../db/repositories/pushSendsRepo');
const { withConnection, withTransaction } = require('../../db/unitOfWork');
const { dueSends } = require('../pushSchedule');
const { sendToOwner } = require('./sendPush');

const DEFAULT_INTERVAL_MS = 60 * 1000;

const toInstant = (value) => (value ? new Date(value) : null);

const toScheduleRow = (row) => ({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    placeName: row.place_name,
    status: row.status,
    dueDate: row.due_date,
    dueTime: row.due_time,
    timeZone: row.time_zone,
    alertAt: toInstant(row.alert_at),
    snoozedUntil: toInstant(row.snoozed_until),
    createdAt: toInstant(row.created_at),
});

/** Claims each due push before sending it, so overlapping runs and restarts never repeat one. */
const runOnce = async ({ now = new Date() } = {}) => {
    const rows = await withConnection((conn) => sendsRepo.listCandidates(conn));
    const result = { claimed: 0, sent: 0 };

    for (const send of dueSends(rows.map(toScheduleRow), now)) {
        const isClaimed = await withTransaction((conn) => sendsRepo.claim(conn, send));
        if (!isClaimed) continue;

        result.claimed += 1;
        const outcome = await withConnection((conn) => sendToOwner(conn, send.ownerId, send.payload));
        result.sent += outcome.sent;
    }

    return result;
};

const startScheduler = ({ intervalMs = DEFAULT_INTERVAL_MS } = {}) => {
    const timer = setInterval(() => {
        runOnce().catch((err) => console.error('Push scheduler run failed', err));
    }, intervalMs);
    timer.unref();

    return () => clearInterval(timer);
};

module.exports = { runOnce, startScheduler };
