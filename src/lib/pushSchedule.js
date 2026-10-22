'use strict';

const { zonedInstant } = require('./reminderSchedule');

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MORNING_TIME = '08:00:00';

const withSeconds = (time) => (time.length === 5 ? `${time}:00` : time);

// The moment a reminder should alert: explicit alert, else its due time, else the morning of its due date.
const alertInstant = ({ alertAt, dueDate, dueTime, timeZone }) => {
    if (alertAt) return alertAt;
    if (!dueDate) return null;
    return zonedInstant(dueDate, dueTime ? withSeconds(dueTime) : MORNING_TIME, timeZone);
};

const inWindow = (instant, now) => instant > now - LOOKBACK_MS && instant <= now;

const send = (row, kind, dueAt, body) => ({
    reminderId: row.id,
    ownerId: row.ownerId,
    kind,
    dueAt,
    payload: { title: row.title, body, url: `/reminders?open=${row.id}` },
});

const timeSend = (row, now) => {
    const instant = alertInstant(row);
    if (!instant || !inWindow(instant, now)) return null;
    if (row.snoozedUntil && row.snoozedUntil >= instant) return null;
    if (instant < row.createdAt) return null;
    return send(row, 'time', instant, row.placeName || 'Reminder due');
};

const snoozeSend = (row, now) => {
    if (!row.snoozedUntil || !inWindow(row.snoozedUntil, now)) return null;
    return send(row, 'snooze', row.snoozedUntil, 'Snooze ended');
};

const dueSends = (rows, now) =>
    rows
        .filter((row) => row.status === 'open')
        .flatMap((row) => [timeSend(row, now), snoozeSend(row, now)])
        .filter(Boolean);

module.exports = { LOOKBACK_MS, alertInstant, dueSends };
