'use strict';

const { toReminder } = require('../../src/lib/serializers');

describe('toReminder', () => {
    const NOW = new Date('2026-10-06T00:00:00.000Z');
    const row = {
        id: 5, owner_id: 9, title: 'Call', place_id: 1, place_name: 'Home',
        subcategory_id: 2, subcategory_name: 'Kitchen', person_id: 3, person_name: 'Ann',
        project_id: 4, project_title: 'Reno', todo_id: 6, todo_text: 'Buy tile',
        due_date: new Date(2026, 9, 5), due_time: '09:05:00', time_zone: 'America/Chicago',
        alert_at: new Date('2026-10-05T14:00:00.000Z'), location_trigger: 'arrive',
        priority: 'high', status: 'open', snoozed_until: new Date('2026-10-05T15:30:00.000Z'),
        closed_at: new Date('2026-10-06T01:02:03.000Z'), repeat_rule: 'weekly', repeat_every: null,
        repeat_weekdays: 'mon,wed', repeated_from_id: null,
        created_at: new Date('2026-10-01T00:00:00.000Z'), updated_at: new Date('2026-10-02T00:00:00.000Z'),
    };

    test('maps the row to the wire shape and drops owner and repeatedFromId', () => {
        expect(toReminder(row, NOW)).toEqual({
            id: 5, title: 'Call',
            place: { id: 1, label: 'Home' }, subcategory: { id: 2, label: 'Kitchen' },
            person: { id: 3, label: 'Ann' }, project: { id: 4, label: 'Reno' },
            todo: { id: 6, label: 'Buy tile' },
            dueDate: '2026-10-05', dueTime: '09:05', timeZone: 'America/Chicago',
            alertAt: '2026-10-05T14:00:00.000Z', trigger: 'arrive', priority: 'high', status: 'open',
            snoozedUntil: '2026-10-05T15:30:00.000Z', closedAt: '2026-10-06T01:02:03.000Z',
            repeat: { rule: 'weekly', every: null, weekdays: ['mon', 'wed'] },
            createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
            overdue: true,
        });
    });

    test('gives null links, dates and instants, and empty weekdays when unset', () => {
        const bare = {
            ...row, place_id: null, subcategory_id: null, person_id: null, project_id: null, todo_id: null,
            due_date: null, due_time: null, alert_at: null, snoozed_until: null, closed_at: null,
            repeat_rule: 'none', repeat_weekdays: '',
        };
        expect(toReminder(bare)).toMatchObject({
            place: null, subcategory: null, person: null, project: null, todo: null,
            dueDate: null, dueTime: null, alertAt: null, snoozedUntil: null, closedAt: null,
            repeat: { rule: 'none', every: null, weekdays: [] },
        });
    });

    test('flags overdue from the given now and not for the same row before its due time', () => {
        expect(toReminder(row, new Date('2026-10-05T14:04:00.000Z')).overdue).toBe(false);
        expect(toReminder(row, new Date('2026-10-05T14:05:00.000Z')).overdue).toBe(true);
        expect(toReminder({ ...row, status: 'done' }, NOW).overdue).toBe(false);
    });

    test('defaults now to the current time', () => {
        expect(toReminder({ ...row, due_date: '2000-01-01', due_time: null }).overdue).toBe(true);
        expect(toReminder({ ...row, due_date: '2999-01-01', due_time: null }).overdue).toBe(false);
    });

    test('accepts date and time values that arrive as strings', () => {
        expect(toReminder({ ...row, due_date: '2026-10-05', due_time: '23:59:59' }))
            .toMatchObject({ dueDate: '2026-10-05', dueTime: '23:59' });
    });
});
