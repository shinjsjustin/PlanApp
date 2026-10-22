'use strict';

const { nextDueDate, shiftAlert, isOverdue } = require('../../src/lib/reminderSchedule');

describe('nextDueDate', () => {
    test.each([
        ['none', { dueDate: '2026-03-10', rule: 'none' }, null],
        ['daily', { dueDate: '2026-03-10', rule: 'daily' }, '2026-03-11'],
        ['daily across year end', { dueDate: '2026-12-31', rule: 'daily' }, '2027-01-01'],
        ['every_n_days', { dueDate: '2026-03-10', rule: 'every_n_days', every: 5 }, '2026-03-15'],
        // 2026-03-10 is a Tuesday
        ['weekly later this week', { dueDate: '2026-03-10', rule: 'weekly', weekdays: ['mon', 'thu'] }, '2026-03-12'],
        ['weekly wraps to next week', { dueDate: '2026-03-10', rule: 'weekly', weekdays: ['mon'] }, '2026-03-16'],
        ['weekly never repeats the same day', { dueDate: '2026-03-10', rule: 'weekly', weekdays: ['tue'] }, '2026-03-17'],
        // 2026-03-15 is a Sunday
        ['weekly sun to mon', { dueDate: '2026-03-15', rule: 'weekly', weekdays: ['mon', 'wed'] }, '2026-03-16'],
        ['weekly unordered list', { dueDate: '2026-03-10', rule: 'weekly', weekdays: ['sun', 'wed'] }, '2026-03-11'],
        ['monthly', { dueDate: '2026-03-10', rule: 'monthly' }, '2026-04-10'],
        ['monthly clamps to month end', { dueDate: '2026-01-31', rule: 'monthly' }, '2026-02-28'],
        ['monthly clamps in leap year', { dueDate: '2028-01-31', rule: 'monthly' }, '2028-02-29'],
        ['monthly clamps 31 to 30', { dueDate: '2026-03-31', rule: 'monthly' }, '2026-04-30'],
        ['monthly across year end', { dueDate: '2026-12-15', rule: 'monthly' }, '2027-01-15'],
    ])('%s', (_name, input, expected) => {
        expect(nextDueDate(input)).toBe(expected);
    });
});

describe('shiftAlert', () => {
    const chicago = 'America/Chicago';

    test('keeps local clock time across the fall-back DST change', () => {
        const alert = new Date('2026-10-31T13:00:00Z'); // 08:00 CDT
        expect(shiftAlert(alert, '2026-10-31', '2026-11-01', chicago).toISOString()).toBe('2026-11-01T14:00:00.000Z');
    });

    test('keeps local clock time across the spring-forward DST change', () => {
        const alert = new Date('2026-03-07T14:00:00Z'); // 08:00 CST
        expect(shiftAlert(alert, '2026-03-07', '2026-03-08', chicago).toISOString()).toBe('2026-03-08T13:00:00.000Z');
    });

    test('shifts by the day difference, not onto toDate itself', () => {
        const alert = new Date('2026-10-30T13:00:00Z'); // alert is a day before due
        expect(shiftAlert(alert, '2026-10-31', '2026-11-07', chicago).toISOString()).toBe('2026-11-06T14:00:00.000Z');
    });

    test('uses the alert zone for the local date near UTC midnight', () => {
        const alert = new Date('2026-06-02T03:30:00Z'); // 2026-06-01 22:30 CDT
        expect(shiftAlert(alert, '2026-06-02', '2026-06-03', chicago).toISOString()).toBe('2026-06-03T03:30:00.000Z');
    });

    test('returns null when there is no alert', () => {
        expect(shiftAlert(null, '2026-10-31', '2026-11-01', chicago)).toBeNull();
    });
});

describe('isOverdue', () => {
    const zone = 'America/Chicago';
    const now = new Date('2026-06-10T17:00:00Z'); // 12:00 CDT on 2026-06-10

    test.each([
        ['date-only before today', { status: 'open', dueDate: '2026-06-09', dueTime: null }, true],
        ['date-only today is not overdue', { status: 'open', dueDate: '2026-06-10', dueTime: null }, false],
        ['date-only in future', { status: 'open', dueDate: '2026-06-11', dueTime: null }, false],
        ['timed earlier today', { status: 'open', dueDate: '2026-06-10', dueTime: '11:59:00' }, true],
        ['timed exactly now', { status: 'open', dueDate: '2026-06-10', dueTime: '12:00' }, true],
        ['timed later today', { status: 'open', dueDate: '2026-06-10', dueTime: '12:01:00' }, false],
        ['timed on a past day', { status: 'open', dueDate: '2026-06-09', dueTime: '23:59:00' }, true],
        ['timed on a future day', { status: 'open', dueDate: '2026-06-11', dueTime: '00:00:00' }, false],
        ['done reminder', { status: 'done', dueDate: '2026-06-01', dueTime: null }, false],
        ['no due date', { status: 'open', dueDate: null, dueTime: null }, false],
    ])('%s', (_name, reminder, expected) => {
        expect(isOverdue({ ...reminder, timeZone: zone }, now)).toBe(expected);
    });

    test('judges "today" in the reminder zone, not UTC', () => {
        // 2026-06-11T03:00Z is still 2026-06-10 in Chicago
        const lateNow = new Date('2026-06-11T03:00:00Z');
        expect(isOverdue({ status: 'open', dueDate: '2026-06-10', dueTime: null, timeZone: zone }, lateNow)).toBe(false);
    });
});
