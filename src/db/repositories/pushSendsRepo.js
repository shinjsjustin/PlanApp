'use strict';

/** Data access for `push_sends`: one row per push already claimed, so a restart never repeats it. */

const UTC_FORMAT = "'%Y-%m-%dT%H:%i:%sZ'";
const utcInstant = (column) => `DATE_FORMAT(r.${column}, ${UTC_FORMAT}) AS ${column}`;

// created_at is a TIMESTAMP stored from the session clock, so it is converted to UTC first.
const CREATED_AT_UTC = `DATE_FORMAT(CONVERT_TZ(r.created_at, @@session.time_zone, '+00:00'), ${UTC_FORMAT}) AS created_at`;

/** Open reminders of every owner that have a date, alert or snooze. */
const listCandidates = async (conn) => {
    const [rows] = await conn.execute(
        `SELECT r.id, r.owner_id, r.title, r.status, r.time_zone, r.due_time,
                DATE_FORMAT(r.due_date, '%Y-%m-%d') AS due_date,
                ${utcInstant('alert_at')}, ${utcInstant('snoozed_until')}, ${CREATED_AT_UTC},
                pl.name AS place_name
         FROM reminders r
         LEFT JOIN places pl ON pl.id = r.place_id
         WHERE r.status = 'open'
           AND (r.alert_at IS NOT NULL OR r.due_date IS NOT NULL OR r.snoozed_until IS NOT NULL)`
    );

    return rows;
};

/** True only when this call recorded the send, so exactly one caller goes on to push it. */
const claim = async (conn, { reminderId, kind, dueAt }) => {
    const [result] = await conn.execute(
        'INSERT IGNORE INTO push_sends (reminder_id, kind, due_at) VALUES (?, ?, ?)',
        [reminderId, kind, dueAt.toISOString().slice(0, 19).replace('T', ' ')]
    );

    return result.affectedRows === 1;
};

module.exports = { listCandidates, claim };
