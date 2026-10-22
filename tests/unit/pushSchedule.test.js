'use strict';

const { LOOKBACK_MS, alertInstant, dueSends } = require('../../src/lib/pushSchedule');
const { zonedInstant } = require('../../src/lib/reminderSchedule');

const LA = 'America/Los_Angeles';
const HOUR = 60 * 60 * 1000;

const row = (overrides = {}) => ({
    id: 7,
    ownerId: 3,
    title: 'Pay rent',
    placeName: null,
    status: 'open',
    dueDate: null,
    dueTime: null,
    timeZone: LA,
    alertAt: null,
    snoozedUntil: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
});

describe('LOOKBACK_MS', () => {
    test('is 24 hours', () => {
        expect(LOOKBACK_MS).toBe(24 * HOUR);
    });
});

describe('zonedInstant export', () => {
    test('turns local wall time into an instant', () => {
        expect(zonedInstant('2026-01-15', '09:00:00', LA).toISOString()).toBe('2026-01-15T17:00:00.000Z');
    });
});

describe('alertInstant', () => {
    test('prefers alertAt over due date and time', () => {
        const alertAt = new Date('2026-01-15T10:00:00Z');
        expect(alertInstant(row({ alertAt, dueDate: '2026-01-20', dueTime: '09:00:00' }))).toEqual(alertAt);
    });

    test('uses due date and time in the reminder zone', () => {
        expect(alertInstant(row({ dueDate: '2026-01-15', dueTime: '09:30:00' })).toISOString()).toBe(
            '2026-01-15T17:30:00.000Z',
        );
    });

    test('accepts HH:MM times', () => {
        expect(alertInstant(row({ dueDate: '2026-01-15', dueTime: '09:30' })).toISOString()).toBe(
            '2026-01-15T17:30:00.000Z',
        );
    });

    test('uses 08:00 local for a date-only reminder', () => {
        expect(alertInstant(row({ dueDate: '2026-01-15' })).toISOString()).toBe('2026-01-15T16:00:00.000Z');
    });

    test('uses the zone offset after spring-forward', () => {
        // 2026-03-08 is the US DST start; 08:00 is PDT (UTC-7)
        expect(alertInstant(row({ dueDate: '2026-03-08' })).toISOString()).toBe('2026-03-08T15:00:00.000Z');
    });

    test('uses the zone offset on the fall-back day', () => {
        // 2026-11-01 is the US DST end; 08:00 is PST (UTC-8)
        expect(alertInstant(row({ dueDate: '2026-11-01' })).toISOString()).toBe('2026-11-01T16:00:00.000Z');
    });

    test('is null without alert or due date', () => {
        expect(alertInstant(row())).toBeNull();
    });

    test('is null with a due time but no due date', () => {
        expect(alertInstant(row({ dueTime: '09:00:00' }))).toBeNull();
    });
});

describe('dueSends', () => {
    const now = new Date('2026-01-15T18:00:00Z');

    test('returns a time send with payload for an instant just passed', () => {
        const sends = dueSends([row({ dueDate: '2026-01-15', dueTime: '09:00:00' })], now);
        expect(sends).toEqual([
            {
                reminderId: 7,
                ownerId: 3,
                kind: 'time',
                dueAt: new Date('2026-01-15T17:00:00Z'),
                payload: { title: 'Pay rent', body: 'Reminder due', url: '/reminders?open=7' },
            },
        ]);
    });

    test('names the place in the body when there is one', () => {
        const [send] = dueSends([row({ placeName: 'Dentist', dueDate: '2026-01-15', dueTime: '09:00:00' })], now);
        expect(send.payload.body).toBe('Dentist');
    });

    test('includes an instant exactly at now', () => {
        expect(dueSends([row({ alertAt: now })], now)).toHaveLength(1);
    });

    test('skips an instant in the future', () => {
        expect(dueSends([row({ alertAt: new Date(now.getTime() + 1) })], now)).toHaveLength(0);
    });

    test('skips an instant exactly 24h old but keeps one just inside', () => {
        const old = row({ alertAt: new Date(now.getTime() - LOOKBACK_MS) });
        const recent = row({ alertAt: new Date(now.getTime() - LOOKBACK_MS + 1) });
        expect(dueSends([old], now)).toHaveLength(0);
        expect(dueSends([recent], now)).toHaveLength(1);
    });

    test.each(['done', 'dismissed'])('never sends for %s reminders', (status) => {
        const rows = [
            row({ status, alertAt: new Date(now.getTime() - HOUR), snoozedUntil: new Date(now.getTime() - HOUR) }),
        ];
        expect(dueSends(rows, now)).toEqual([]);
    });

    test('skips a time send when snoozed until at or after the instant', () => {
        const alertAt = new Date(now.getTime() - 2 * HOUR);
        const kinds = (snoozedUntil) => dueSends([row({ alertAt, snoozedUntil })], now).map((s) => s.kind);
        expect(kinds(alertAt)).not.toContain('time');
        expect(kinds(new Date(alertAt.getTime() + 1))).not.toContain('time');
    });

    test('sends time when snoozedUntil is before the instant', () => {
        const alertAt = new Date(now.getTime() - HOUR);
        const sends = dueSends([row({ alertAt, snoozedUntil: new Date(alertAt.getTime() - 1) })], now);
        expect(sends.map((s) => s.kind)).toEqual(['time', 'snooze']);
    });

    test('skips a time send when the instant is before createdAt', () => {
        const alertAt = new Date(now.getTime() - 2 * HOUR);
        const created = row({ alertAt, createdAt: new Date(alertAt.getTime() + 1) });
        expect(dueSends([created], now)).toEqual([]);
        expect(dueSends([row({ alertAt, createdAt: alertAt })], now)).toHaveLength(1);
    });

    test('fires a snooze send when snoozedUntil is in the window', () => {
        const snoozedUntil = new Date(now.getTime() - HOUR);
        const sends = dueSends([row({ snoozedUntil })], now);
        expect(sends).toEqual([
            {
                reminderId: 7,
                ownerId: 3,
                kind: 'snooze',
                dueAt: snoozedUntil,
                payload: { title: 'Pay rent', body: 'Snooze ended', url: '/reminders?open=7' },
            },
        ]);
    });

    test('snooze window is (now - 24h, now]', () => {
        const at = (ms) => dueSends([row({ snoozedUntil: new Date(now.getTime() + ms) })], now);
        expect(at(0)).toHaveLength(1);
        expect(at(1)).toHaveLength(0);
        expect(at(-LOOKBACK_MS)).toHaveLength(0);
        expect(at(-LOOKBACK_MS + 1)).toHaveLength(1);
    });

    test('a reminder with a place still gets its time send', () => {
        const sends = dueSends([row({ placeName: 'Gym', dueDate: '2026-01-15', dueTime: '09:00:00' })], now);
        expect(sends.map((s) => s.kind)).toEqual(['time']);
    });

    test('sends nothing for a reminder with no instant', () => {
        expect(dueSends([row()], now)).toEqual([]);
    });

    test('a date-only reminder fires at 08:00 on a DST day', () => {
        const dst = new Date('2026-03-08T15:30:00Z'); // 08:30 PDT
        expect(dueSends([row({ dueDate: '2026-03-08' })], dst)).toHaveLength(1);
        expect(dueSends([row({ dueDate: '2026-03-08' })], new Date('2026-03-08T14:59:59Z'))).toHaveLength(0);
    });
});
