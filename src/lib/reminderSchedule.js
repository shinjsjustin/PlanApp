'use strict';

const { addDays, localToday } = require('./localDate');

const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAYS_PER_WEEK = 7;

// Index 0 = Monday, matching WEEKDAY_ORDER; UTC maths keeps DST out of it.
const weekdayIndex = (dateKey) => (new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % DAYS_PER_WEEK;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const nextMonthly = (dueDate) => {
    const [year, month, day] = dueDate.split('-').map(Number);
    const target = new Date(Date.UTC(year, month, 1)); // first of next month
    const targetYear = target.getUTCFullYear();
    const targetMonth = target.getUTCMonth() + 1;
    const clamped = Math.min(day, daysInMonth(targetYear, targetMonth));
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
};

const nextWeekly = (dueDate, weekdays) => {
    const wanted = new Set(weekdays.map((day) => WEEKDAY_ORDER.indexOf(day)));
    const current = weekdayIndex(dueDate);
    for (let offset = 1; offset <= DAYS_PER_WEEK; offset += 1) {
        if (wanted.has((current + offset) % DAYS_PER_WEEK)) return addDays(dueDate, offset);
    }
    return null;
};

// Always counts from dueDate, never today, so a late completion keeps the cadence.
const nextDueDate = ({ dueDate, rule, every, weekdays }) => {
    switch (rule) {
        case 'daily':
            return addDays(dueDate, 1);
        case 'every_n_days':
            return addDays(dueDate, every);
        case 'weekly':
            return nextWeekly(dueDate, weekdays);
        case 'monthly':
            return nextMonthly(dueDate);
        default:
            return null;
    }
};

// Wall-clock parts of an instant in a zone.
const zonedParts = (instant, timeZone) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(instant)
            .map(({ type, value }) => [type, value]),
    );
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}:${parts.second}`,
    };
};

// Converts a wall-clock date and time in a zone to the instant; two passes settle the offset at a DST edge.
const zonedInstant = (dateKey, time, timeZone) => {
    const wallAsUtc = Date.parse(`${dateKey}T${time}Z`);
    let guess = wallAsUtc;
    for (let pass = 0; pass < 2; pass += 1) {
        const local = zonedParts(new Date(guess), timeZone);
        guess += wallAsUtc - Date.parse(`${local.date}T${local.time}Z`);
    }
    return new Date(guess);
};

const daysBetween = (fromDate, toDate) =>
    Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / (24 * 60 * 60 * 1000));

// Moves the alert by the same number of days as the due date, keeping its local clock time.
const shiftAlert = (alertAt, fromDate, toDate, timeZone) => {
    if (!alertAt) return null;
    const local = zonedParts(alertAt, timeZone);
    return zonedInstant(addDays(local.date, daysBetween(fromDate, toDate)), local.time, timeZone);
};

const isOverdue = ({ status, dueDate, dueTime, timeZone }, now) => {
    if (status !== 'open' || !dueDate) return false;
    if (!dueTime) return dueDate < localToday(timeZone, now);
    const local = zonedParts(now, timeZone);
    const due = dueTime.length === 5 ? `${dueTime}:00` : dueTime;
    return dueDate < local.date || (dueDate === local.date && due <= local.time);
};

module.exports = { nextDueDate, shiftAlert, isOverdue, zonedInstant };
