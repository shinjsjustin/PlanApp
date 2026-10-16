'use strict';

/**
 * Data access for `calendar_events` — read-only copies of Google events, never
 * pushed back and never blocking bookings. A day's events are replaced
 * wholesale on each import.
 *
 * Ownership: `listByOwner` scopes through `calendar_days`; `replaceForDay`
 * trusts its caller to hold a day id cleared by `assertOwnership`.
 */

const SELECT_COLUMNS =
    'e.id, e.day_id, e.google_event_id, e.title, e.all_day, e.start_minutes, e.duration_minutes, e.location, e.created_at, e.updated_at';

/** Every imported event in the owner's calendar, days left to right, all-day first. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS}
         FROM calendar_events e
         JOIN calendar_days d ON d.id = e.day_id
         WHERE d.owner_id = ?
         ORDER BY d.position, e.all_day DESC, e.start_minutes, e.id`,
        [ownerId]
    );

    return rows;
};

/** Leaves exactly `events` on the day. Runs several statements, so callers use a transaction. */
const replaceForDay = async (conn, dayId, events) => {
    await conn.execute('DELETE FROM calendar_events WHERE day_id = ?', [dayId]);

    for (const { googleEventId, title, allDay, startMinutes, durationMinutes, location } of events) {
        await conn.execute(
            `INSERT INTO calendar_events
                (day_id, google_event_id, title, all_day, start_minutes, duration_minutes, location)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [dayId, googleEventId, title, allDay ? 1 : 0, startMinutes, durationMinutes, location ?? null]
        );
    }
};

module.exports = { listByOwner, replaceForDay };
