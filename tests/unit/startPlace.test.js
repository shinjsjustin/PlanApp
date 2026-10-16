'use strict';

const { startPlaceId } = require('../../src/lib/startPlace');

const place = (id, kind, isDefaultStart = false) => ({ id, kind, isDefaultStart });

describe('startPlaceId', () => {
    test.each([
        ['the marked place over a home', [place(1, 'home'), place(2, 'work', true)], 2],
        ['the lowest-id home when none is marked', [place(5, 'home'), place(3, 'work'), place(4, 'home')], 4],
        ['null when none is marked and there is no home', [place(1, 'work'), place(2, 'client')], null],
        ['null for no places', [], null],
    ])('returns %s', (_label, places, expected) => {
        expect(startPlaceId(places)).toBe(expected);
    });
});
