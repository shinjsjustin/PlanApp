'use strict';

/**
 * Reads for place events. Nothing about the event itself is stored.
 */

// snoozed_until is stored in UTC wall time.
const toUtcWallTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

/** Open, unsnoozed reminders at the place whose trigger equals the event, soonest due first. */
const listTriggered = async (conn, ownerId, placeId, event, now) => {
    const [rows] = await conn.execute(
        `SELECT id, title FROM reminders
         WHERE owner_id = ? AND place_id = ? AND location_trigger = ? AND status = 'open'
           AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ORDER BY due_date IS NULL, due_date, id`,
        [ownerId, placeId, event, toUtcWallTime(now)]
    );

    return rows;
};

module.exports = { listTriggered };
