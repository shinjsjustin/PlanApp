'use strict';

const { isDateKey, addDays, localToday, timeZoneOf } = require('../../src/lib/localDate');

const reqWith = (value) => ({ get: (name) => (name === 'X-Time-Zone' ? value : undefined) });
const serverZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('isDateKey', () => {
    test.each([
        ['2026-10-15', true],
        ['2028-02-29', true],
        ['2026-02-29', false],
        ['2026-13-01', false],
        ['2026-1-5', false],
        ['2026-10-15T00:00', false],
        ['', false],
        [null, false],
        [20261015, false],
    ])('%p -> %p', (value, expected) => {
        expect(isDateKey(value)).toBe(expected);
    });
});

describe('addDays', () => {
    test.each([
        ['2026-12-31', 1, '2027-01-01'],
        ['2026-03-01', -1, '2026-02-28'],
        ['2026-10-15', 0, '2026-10-15'],
        ['2026-01-30', 30, '2026-03-01'],
    ])('%s + %i = %s', (key, n, expected) => {
        expect(addDays(key, n)).toBe(expected);
    });
});

describe('localToday', () => {
    const now = new Date('2026-10-15T03:00:00Z');

    test('uses the previous day in a zone behind UTC', () => {
        expect(localToday('America/Chicago', now)).toBe('2026-10-14');
    });

    test('uses the same day in a zone ahead of UTC', () => {
        expect(localToday('Asia/Tokyo', now)).toBe('2026-10-15');
    });
});

describe('timeZoneOf', () => {
    test('returns the header when Intl accepts it', () => {
        expect(timeZoneOf(reqWith('America/Chicago'))).toBe('America/Chicago');
    });

    test('falls back to the server zone when missing', () => {
        expect(timeZoneOf(reqWith(undefined))).toBe(serverZone);
    });

    test('falls back to the server zone when invalid', () => {
        expect(timeZoneOf(reqWith('Not/AZone'))).toBe(serverZone);
    });
});
