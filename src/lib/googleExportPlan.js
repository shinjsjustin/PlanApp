'use strict';

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

const exportBodies = (bookings, days, timeZone) => {
    const dateByDay = new Map(days.map((day) => [day.id, day.date]));
    return bookings
        .filter((booking) => dateByDay.get(booking.day_id))
        .map((booking) => {
            const date = dateByDay.get(booking.day_id);
            const itemKey = itemKeyOf(booking);
            return {
                itemKey,
                body: {
                    summary: booking.todo_id != null ? booking.text : booking.sequence_title,
                    start: wallClock(date, booking.start_minutes, timeZone),
                    end: wallClock(date, booking.start_minutes + booking.duration_minutes, timeZone),
                    extendedProperties: { private: { shinplanKey: itemKey } },
                },
            };
        });
};

const planExport = (bodies, mappings) => {
    const eventIdByKey = new Map(mappings.map((m) => [m.itemKey, m.googleEventId]));
    const bodyKeys = new Set(bodies.map((b) => b.itemKey));
    return {
        creates: bodies.filter((b) => !eventIdByKey.has(b.itemKey)),
        updates: bodies
            .filter((b) => eventIdByKey.has(b.itemKey))
            .map((b) => ({ ...b, googleEventId: eventIdByKey.get(b.itemKey) })),
        deletes: mappings.filter((m) => !bodyKeys.has(m.itemKey)),
    };
};

module.exports = { exportBodies, planExport };
