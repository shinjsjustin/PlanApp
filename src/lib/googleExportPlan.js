'use strict';

const crypto = require('crypto');
const { addDays } = require('./localDate');

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;

const pad = (n) => String(n).padStart(2, '0');

// Local wall-clock time, so Google applies the zone's DST rules itself.
const wallClock = (date, minutes, timeZone) => {
    const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
    const minuteOfDay = minutes % MINUTES_PER_DAY;
    const time = `${pad(Math.floor(minuteOfDay / MINUTES_PER_HOUR))}:${pad(minuteOfDay % MINUTES_PER_HOUR)}`;
    return { dateTime: `${addDays(date, dayOffset)}T${time}:00`, timeZone };
};

const itemKeyOf = (booking) =>
    booking.todo_id != null ? `todo:${booking.todo_id}` : `sequence:${booking.booked_sequence_id}`;

// Body keys are built in a fixed order, so the JSON text is stable.
const hashOf = (body) => crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

const exportBodies = (bookings, days, timeZone) => {
    const dateByDay = new Map(days.map((day) => [day.id, day.date]));
    return bookings
        .filter((booking) => dateByDay.get(booking.day_id))
        .map((booking) => {
            const date = dateByDay.get(booking.day_id);
            const itemKey = itemKeyOf(booking);
            const body = {
                summary: booking.todo_id != null ? booking.text : booking.sequence_title,
                start: wallClock(date, booking.start_minutes, timeZone),
                end: wallClock(date, booking.start_minutes + booking.duration_minutes, timeZone),
                extendedProperties: { private: { shinplanKey: itemKey } },
            };
            return { itemKey, bodyHash: hashOf(body), body };
        });
};

const planExport = (bodies, mappings) => {
    const mappingByKey = new Map(mappings.map((m) => [m.itemKey, m]));
    const bodyKeys = new Set(bodies.map((b) => b.itemKey));
    const mapped = bodies
        .filter((b) => mappingByKey.has(b.itemKey))
        .map((b) => ({ ...b, googleEventId: mappingByKey.get(b.itemKey).googleEventId }));
    const isUnchanged = (b) => mappingByKey.get(b.itemKey).bodyHash === b.bodyHash;
    return {
        creates: bodies.filter((b) => !mappingByKey.has(b.itemKey)),
        updates: mapped.filter((b) => !isUnchanged(b)),
        unchanged: mapped.filter(isUnchanged),
        deletes: mappings.filter((m) => !bodyKeys.has(m.itemKey)),
    };
};

module.exports = { exportBodies, planExport };
