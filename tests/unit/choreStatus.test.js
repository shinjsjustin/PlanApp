'use strict';

const { dueStatus, sortByUrgency } = require('../../src/lib/choreStatus');

const win = { windowMin: 7, windowMax: 14 };

describe('dueStatus', () => {
    test('returns never with nulls when lastDoneOn is null', () => {
        expect(dueStatus({ ...win, lastDoneOn: null }, '2026-10-31')).toEqual({
            status: 'never', daysSince: null, urgency: null, dueFrom: null, dueBy: null,
        });
    });

    test.each([
        ['2026-10-25', 6, 'upcoming', 0.43],
        ['2026-10-24', 7, 'due', 0.5],
        ['2026-10-17', 14, 'due', 1],
        ['2026-10-16', 15, 'overdue', 1.07],
        ['2026-10-31', 0, 'upcoming', 0],
    ])('lastDoneOn %s gives daysSince %i, %s, urgency %f', (lastDoneOn, daysSince, status, urgency) => {
        const result = dueStatus({ ...win, lastDoneOn }, '2026-10-31');
        expect(result.daysSince).toBe(daysSince);
        expect(result.status).toBe(status);
        expect(result.urgency).toBe(urgency);
    });

    test('computes dueFrom and dueBy across a month boundary', () => {
        const result = dueStatus({ ...win, lastDoneOn: '2026-10-28' }, '2026-10-31');
        expect(result.dueFrom).toBe('2026-11-04');
        expect(result.dueBy).toBe('2026-11-11');
    });
});

describe('sortByUrgency', () => {
    const chore = (name, status, urgency, min = 1, max = 2) => ({
        name, status, urgency, window: { min, max },
    });

    test('orders by status, urgency descending, then name; never last by window', () => {
        const input = [
            chore('n-b', 'never', null, 3, 7),
            chore('up', 'upcoming', 0.2),
            chore('n-a', 'never', null, 7, 14),
            chore('n-c', 'never', null, 3, 7),
            chore('n-d', 'never', null, 1, 7),
            chore('due-b', 'due', 0.8),
            chore('due-a', 'due', 0.8),
            chore('due-hi', 'due', 0.9),
            chore('over', 'overdue', 1.5),
        ];
        const copy = [...input];
        const names = sortByUrgency(input).map((c) => c.name);
        expect(names).toEqual(['over', 'due-hi', 'due-a', 'due-b', 'up', 'n-d', 'n-b', 'n-c', 'n-a']);
        expect(input).toEqual(copy);
    });
});
