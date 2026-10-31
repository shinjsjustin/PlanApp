'use strict';

const starterChores = require('../../src/lib/starterChores');

describe('starterChores', () => {
    test('lists the 12 chores with their windows and areas', () => {
        expect(starterChores.map((c) => [c.name, c.area, c.min, c.max])).toEqual([
            ['Clean bathrooms', 'Bathroom', 7, 10],
            ['Vacuum floors', null, 7, 14],
            ['Mop floors', null, 14, 21],
            ['Change bed sheets', 'Bedroom', 7, 14],
            ['Take out trash', 'Kitchen', 3, 7],
            ['Wipe kitchen counters', 'Kitchen', 3, 7],
            ['Clean stovetop', 'Kitchen', 7, 14],
            ['Clean out fridge', 'Kitchen', 30, 45],
            ['Clean microwave', 'Kitchen', 14, 30],
            ['Dust surfaces', null, 14, 21],
            ['Do laundry', 'Laundry', 5, 7],
            ['Replace HVAC filter', null, 60, 90],
        ]);
    });

    test('has unique names and min below max', () => {
        expect(new Set(starterChores.map((c) => c.name)).size).toBe(12);
        starterChores.forEach((c) => expect(c.min).toBeLessThan(c.max));
    });

    test('is frozen', () => {
        expect(Object.isFrozen(starterChores)).toBe(true);
    });
});
