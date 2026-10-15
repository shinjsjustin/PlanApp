'use strict';

const { addDays, localToday } = require('./localDate');

// A day of slack each side covers any zone's offset from UTC.
const rangeWindow = (from, to) => ({
    timeMin: new Date(`${addDays(from, -1)}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${addDays(to, 2)}T00:00:00Z`).toISOString(),
});

const localDateOf = (point, timeZone) =>
    point.date ?? localToday(timeZone, new Date(point.dateTime));

// All-day end dates are exclusive; timed events are inclusive of their end's local date.
const overlaps = (event, from, to, timeZone) => {
    if (event.start.date) return event.start.date <= to && event.end.date > from;
    return localDateOf(event.start, timeZone) <= to && localDateOf(event.end, timeZone) >= from;
};

const eventsInRange = (googleEvents, from, to, timeZone) =>
    googleEvents
        .filter((event) => event.status !== 'cancelled' && overlaps(event, from, to, timeZone))
        .map((event) => ({
            id: event.id,
            summary: event.summary ?? null,
            start: event.start.date ?? event.start.dateTime,
            end: event.end.date ?? event.end.dateTime,
            allDay: Boolean(event.start.date),
            location: event.location ?? null,
        }));

module.exports = { eventsInRange, rangeWindow };
