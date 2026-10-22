'use strict';

const {
    REQUIRED_PLACES,
    missingPlaces,
    dueDateFor,
    planReminders,
} = require('../../src/lib/reminderSetupPlan');

// 2026-10-22 is a Thursday.
const TODAY = '2026-10-22';

describe('missingPlaces', () => {
    it('returns every required place with kind and null address when none exist', () => {
        expect(missingPlaces([])).toEqual([
            { name: 'Home', address: null, kind: 'home' },
            { name: 'Leemac', address: null, kind: 'work' },
            { name: 'Church', address: null, kind: 'church' },
            { name: 'Western Digital', address: null, kind: 'other' },
            { name: 'Seagate', address: null, kind: 'other' },
            { name: 'Bloom shipping', address: null, kind: 'other' },
            { name: 'Bloom HQ', address: null, kind: 'other' },
        ]);
        expect(REQUIRED_PLACES).toHaveLength(7);
    });

    it('matches existing names ignoring case and surrounding spaces', () => {
        const names = ['Western digital ', ' HOME', 'church', 'Leemac', 'seagate', 'Bloom shipping'];
        expect(missingPlaces(names)).toEqual([{ name: 'Bloom HQ', address: null, kind: 'other' }]);
    });
});

describe('dueDateFor', () => {
    it('returns the next date for a weekday in the text', () => {
        expect(dueDateFor({ sequenceTitle: 'Errands', text: 'call on Mon' }, TODAY)).toBe('2026-10-26');
    });

    it('prefers the sequence title over the text', () => {
        expect(dueDateFor({ sequenceTitle: 'Thursday errands', text: 'Mon pickup' }, '2026-10-20')).toBe('2026-10-22');
    });

    it('returns today when the weekday is today', () => {
        expect(dueDateFor({ sequenceTitle: 'x', text: 'thursday' }, TODAY)).toBe(TODAY);
    });

    it('accepts three-letter and full names in any case', () => {
        expect(dueDateFor({ sequenceTitle: 'FRIDAY run', text: '' }, TODAY)).toBe('2026-10-23');
        expect(dueDateFor({ sequenceTitle: '', text: 'sun' }, TODAY)).toBe('2026-10-25');
    });

    it('does not match a weekday inside another word', () => {
        expect(dueDateFor({ sequenceTitle: 'Monitor', text: 'Sunny' }, TODAY)).toBeNull();
    });

    it('returns null when no weekday is named', () => {
        expect(dueDateFor({ sequenceTitle: null, text: 'Buy milk' }, TODAY)).toBeNull();
    });
});

describe('planReminders', () => {
    const todo = (over) => ({
        id: 1, text: 'Buy milk', status: 'incomplete', placeId: null,
        sequenceTitle: null, sequencePlaceId: null, ...over,
    });

    it('drops complete to-dos and maps the rest', () => {
        const todos = [
            todo({ id: 1, text: 'A', status: 'complete' }),
            todo({ id: 2, text: 'B Mon', placeId: 5, sequencePlaceId: 9 }),
            todo({ id: 3, text: 'C', sequencePlaceId: 9 }),
        ];
        expect(planReminders(todos, TODAY)).toEqual([
            { todoId: 2, title: 'B Mon', placeId: 5, dueDate: '2026-10-26' },
            { todoId: 3, title: 'C', placeId: 9, dueDate: null },
        ]);
    });

    it('uses null place when neither to-do nor sequence has one', () => {
        expect(planReminders([todo({ id: 4 })], TODAY)[0].placeId).toBeNull();
    });
});
