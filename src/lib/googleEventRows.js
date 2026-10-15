'use strict';

const { addDays } = require('./localDate');

const MINUTE_MS = 60000;
const DAY_MINUTES = 1440;
const MAX_ID_LENGTH = 255;
const MAX_TITLE_LENGTH = 500;
const NO_TITLE = '(No title)';

const formatters = new Map();
const formatterFor = (timeZone) => {
    if (!formatters.has(timeZone)) {
        formatters.set(
            timeZone,
            new Intl.DateTimeFormat('en-US', {
                timeZone,
                hourCycle: 'h23',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
            })
        );
    }
    return formatters.get(timeZone);
};

// The zone's wall clock at an instant, read as if it were UTC.
const wallClockMs = (instantMs, timeZone) => {
    const parts = {};
    for (const { type, value } of formatterFor(timeZone).formatToParts(new Date(instantMs))) {
        parts[type] = Number(value);
    }
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};

const offsetMs = (instantMs, timeZone) => wallClockMs(instantMs, timeZone) - instantMs;

// Correct a UTC guess by the zone offset; the second pass settles days whose offset changes.
const localMidnightMs = (dateKey, timeZone) => {
    const guess = Date.parse(`${dateKey}T00:00:00Z`);
    const first = guess - offsetMs(guess, timeZone);
    return guess - offsetMs(first, timeZone);
};

const isShinplanEvent = (event) => Boolean(event.extendedProperties?.private?.shinplanKey);

const isImportable = (event) =>
    event.status !== 'cancelled' &&
    typeof event.id === 'string' &&
    event.id.length <= MAX_ID_LENGTH &&
    !isShinplanEvent(event);

const makeRow = (dayId, event, fields) => ({
    dayId,
    googleEventId: event.id,
    title: (event.summary || NO_TITLE).slice(0, MAX_TITLE_LENGTH),
    ...fields,
});

const allDayRows = (event, datedDays) => {
    const { date: first } = event.start;
    const { date: last } = event.end;
    return datedDays
        .filter((day) => day.date >= first && day.date < last)
        .map((day) =>
            makeRow(day.id, event, { allDay: true, startMinutes: 0, durationMinutes: DAY_MINUTES })
        );
};

const timedRows = (event, datedDays, timeZone) => {
    const startMs = Date.parse(event.start.dateTime);
    const endMs = Date.parse(event.end.dateTime);
    return datedDays.flatMap((day) => {
        const dayStart = localMidnightMs(day.date, timeZone);
        const dayEnd = localMidnightMs(addDays(day.date, 1), timeZone);
        const from = Math.max(startMs, dayStart);
        const to = Math.min(endMs, dayEnd);
        if (to <= from) return [];
        return [
            makeRow(day.id, event, {
                allDay: false,
                startMinutes: Math.round((from - dayStart) / MINUTE_MS),
                durationMinutes: Math.round((to - from) / MINUTE_MS),
            }),
        ];
    });
};

const eventsToDayRows = (events, days, timeZone) => {
    const datedDays = days.filter((day) => day.date);
    return events.filter(isImportable).flatMap((event) => {
        if (event.start?.date && event.end?.date) return allDayRows(event, datedDays);
        if (event.start?.dateTime && event.end?.dateTime) return timedRows(event, datedDays, timeZone);
        return [];
    });
};

// A day of slack before and two after covers any zone's offset from UTC.
const importWindow = (days) => {
    const dates = days.map((day) => day.date).filter(Boolean).sort();
    return {
        timeMin: new Date(`${addDays(dates[0], -1)}T00:00:00Z`).toISOString(),
        timeMax: new Date(`${addDays(dates[dates.length - 1], 2)}T00:00:00Z`).toISOString(),
    };
};

module.exports = { eventsToDayRows, importWindow };
