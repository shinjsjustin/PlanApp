'use strict';

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Rejects strings that look like dates but are not (2026-02-30), before they reach the DB.
const isDateKey = (value) => {
    const match = typeof value === 'string' ? DATE_KEY.exec(value) : null;
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
};

// Calendar arithmetic on a key; UTC maths avoids DST shifting the day.
const addDays = (dateKey, n) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10);
};

// "Today" depends on where the user is, not where the server is.
const localToday = (timeZone, now = new Date()) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);

// The browser sends its zone; a bad or missing header must not break the request.
const timeZoneOf = (req) => {
    const header = req.get('X-Time-Zone');
    try {
        new Intl.DateTimeFormat(undefined, { timeZone: header });
        if (header) return header;
    } catch {
        // invalid zone name: use the server's own
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

module.exports = { isDateKey, addDays, localToday, timeZoneOf };
