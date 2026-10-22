import { parseDueTime, groupRemindersByDate } from './calendarReminders';

describe('parseDueTime', () => {
    test.each([
        ['09:30', 570],
        ['00:00', 0],
        ['23:59', 1439],
        ['9:05', 545],
    ])('turns %s into %i minutes', (value, minutes) => {
        expect(parseDueTime(value)).toBe(minutes);
    });
});

describe('groupRemindersByDate', () => {
    test('groups blocks by dueDate sorted by startMinutes', () => {
        const map = groupRemindersByDate([
            { id: 1, title: 'b', dueDate: '2026-10-22', dueTime: '14:00', priority: 'high', extra: 1 },
            { id: 2, title: 'a', dueDate: '2026-10-22', dueTime: '09:30', priority: 'low' },
            { id: 3, title: 'c', dueDate: '2026-10-23', dueTime: '08:00', priority: 'medium' },
        ]);

        expect(map.get('2026-10-22')).toEqual([
            { id: 2, title: 'a', startMinutes: 570, priority: 'low' },
            { id: 1, title: 'b', startMinutes: 840, priority: 'high' },
        ]);
        expect(map.get('2026-10-23')).toEqual([
            { id: 3, title: 'c', startMinutes: 480, priority: 'medium' },
        ]);
    });

    test('skips reminders missing dueDate or dueTime', () => {
        const map = groupRemindersByDate([
            { id: 1, title: 'x', dueDate: '2026-10-22', dueTime: null, priority: 'low' },
            { id: 2, title: 'y', dueDate: null, dueTime: '10:00', priority: 'low' },
            { id: 3, title: 'z', dueDate: '2026-10-22', dueTime: '', priority: 'low' },
        ]);

        expect(map.size).toBe(0);
    });
});
