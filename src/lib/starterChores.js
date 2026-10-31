'use strict';

const chore = (name, area, min, max) => Object.freeze({ name, area, min, max });

module.exports = Object.freeze([
    chore('Clean bathrooms', 'Bathroom', 7, 10),
    chore('Vacuum floors', null, 7, 14),
    chore('Mop floors', null, 14, 21),
    chore('Change bed sheets', 'Bedroom', 7, 14),
    chore('Take out trash', 'Kitchen', 3, 7),
    chore('Wipe kitchen counters', 'Kitchen', 3, 7),
    chore('Clean stovetop', 'Kitchen', 7, 14),
    chore('Clean out fridge', 'Kitchen', 30, 45),
    chore('Clean microwave', 'Kitchen', 14, 30),
    chore('Dust surfaces', null, 14, 21),
    chore('Do laundry', 'Laundry', 5, 7),
    chore('Replace HVAC filter', null, 60, 90),
]);
