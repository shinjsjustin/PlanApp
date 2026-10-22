'use strict';

const { addDays } = require('./localDate');

const REQUIRED_PLACES = [
    'Home',
    'Leemac',
    'Church',
    'Western Digital',
    'Seagate',
    'Bloom shipping',
    'Bloom HQ',
];

const KIND_BY_NAME = { home: 'home', leemac: 'work', church: 'church' };
const DAYS_PER_WEEK = 7;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date#getUTCDay order
const WEEKDAY_NAME = /\b(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b/i;
const COMPLETE = 'complete';

const normalize = (name) => name.trim().toLowerCase();

const missingPlaces = (names) => {
    const existing = new Set(names.map(normalize));
    return REQUIRED_PLACES.filter((name) => !existing.has(normalize(name))).map((name) => ({
        name,
        address: null,
        kind: KIND_BY_NAME[normalize(name)] || 'other',
    }));
};

const weekdayIn = (value) => {
    const match = WEEKDAY_NAME.exec(value || '');
    return match ? WEEKDAYS.indexOf(match[1].toLowerCase()) : -1;
};

const dueDateFor = ({ sequenceTitle, text }, today) => {
    const wanted = [weekdayIn(sequenceTitle), weekdayIn(text)].find((day) => day >= 0);
    if (wanted === undefined) return null;
    const current = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, (wanted - current + DAYS_PER_WEEK) % DAYS_PER_WEEK);
};

const planReminders = (todos, today) =>
    todos
        .filter((todo) => todo.status !== COMPLETE)
        .map((todo) => ({
            todoId: todo.id,
            title: todo.text,
            placeId: todo.placeId ?? todo.sequencePlaceId ?? null,
            dueDate: dueDateFor(todo, today),
        }));

module.exports = { REQUIRED_PLACES, missingPlaces, dueDateFor, planReminders };
