'use strict';

const { dateKeyOfTitle, titleDateOf } = require('../../src/lib/sequenceDate');

describe('dateKeyOfTitle', () => {
    test.each([
        ['Oct 19', '2026-10-19', '2026-10-19'],
        ['Mon Oct 19', '2026-10-19', '2026-10-19'],
        ['oct 9', '2026-10-19', '2026-10-09'],
        ['Oct 09', '2026-10-19', '2026-10-09'],
        ['Plan - Oct 19 site', '2026-10-19', '2026-10-19'],
        ['OCT   5', '2026-10-19', '2026-10-05'],
        ['Jan 2', '2026-12-30', '2027-01-02'],
        ['Dec 31', '2027-01-01', '2026-12-31'],
        ['Feb 29', '2028-02-10', '2028-02-29'],
        ['Oct 9 then Nov 3', '2026-10-19', '2026-10-09'],
    ])('reads %j on %s as %s', (title, today, expected) => {
        expect(dateKeyOfTitle(title, today)).toBe(expected);
    });

    test.each([
        ['Groceries', '2026-10-19'],
        ['', '2026-10-19'],
        ['Octopus 19', '2026-10-19'],
        ['Oct', '2026-10-19'],
        ['Feb 30', '2026-10-19'],
        ['Oct 32', '2026-10-19'],
        ['Feb 29', '2027-02-10'],
        ['Oct 190', '2026-10-19'],
    ])('gives null for %j on %s', (title, today) => {
        expect(dateKeyOfTitle(title, today)).toBeNull();
    });

    test.each([[null], [undefined], [42], [{}]])('gives null for non-string %p', (title) => {
        expect(dateKeyOfTitle(title, '2026-10-19')).toBeNull();
    });
});

describe('titleDateOf', () => {
    test.each([
        ['2026-10-09', 'Oct 9'],
        ['2026-01-31', 'Jan 31'],
        ['2026-12-01', 'Dec 1'],
    ])('formats %s as %s', (key, expected) => {
        expect(titleDateOf(key)).toBe(expected);
    });
});
