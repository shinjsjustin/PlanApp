import { emptyDraft, fromReminder, toPayload, validate } from './reminderForm';

const REMINDER = {
    id: 41,
    title: 'Drop off paperwork',
    place: { id: 3, label: 'Head office' },
    subcategory: { id: 7, label: 'Front desk' },
    person: { id: 12, label: 'Ada' },
    project: { id: 5, label: 'Move' },
    todo: { id: 9, label: 'Boxes' },
    dueDate: '2026-11-03',
    dueTime: '09:30',
    timeZone: 'America/Los_Angeles',
    alertAt: '2026-11-03T16:00:00.000Z',
    trigger: 'arrive',
    priority: 'high',
    status: 'open',
    repeat: { rule: 'weekly', every: null, weekdays: ['mon', 'thu'] },
};

describe('reminderForm', () => {
    test('toPayload of an empty draft sends nulls and defaults', () => {
        expect(toPayload({ ...emptyDraft(), title: '  Call  ' })).toEqual({
            title: 'Call',
            placeId: null,
            subcategoryId: null,
            personId: null,
            projectId: null,
            todoId: null,
            dueDate: null,
            dueTime: null,
            alertAt: null,
            trigger: 'none',
            priority: 'normal',
            repeat: { rule: 'none' },
        });
    });

    test('fromReminder then toPayload keeps every writable field', () => {
        expect(toPayload(fromReminder(REMINDER))).toEqual({
            title: 'Drop off paperwork',
            placeId: 3,
            subcategoryId: 7,
            personId: 12,
            projectId: 5,
            todoId: 9,
            dueDate: '2026-11-03',
            dueTime: '09:30',
            alertAt: '2026-11-03T16:00:00.000Z',
            trigger: 'arrive',
            priority: 'high',
            repeat: { rule: 'weekly', weekdays: ['mon', 'thu'] },
        });
    });

    test('fromReminder turns an unset reminder into blanks', () => {
        const draft = fromReminder({
            ...REMINDER,
            place: null,
            subcategory: null,
            person: null,
            project: null,
            todo: null,
            dueDate: null,
            dueTime: null,
            alertAt: null,
            repeat: { rule: 'none', every: null, weekdays: [] },
        });
        expect(draft).toEqual({ ...emptyDraft(), title: 'Drop off paperwork', trigger: 'arrive', priority: 'high' });
    });

    test('alert is shown in the browser zone and sent as that instant', () => {
        const local = new Date(2026, 10, 3, 9, 5);
        const draft = fromReminder({ ...REMINDER, alertAt: local.toISOString() });
        expect(draft.alertAt).toBe('2026-11-03T09:05');
        expect(toPayload({ ...draft, alertAt: '2026-11-04T18:45' }).alertAt).toBe(
            new Date(2026, 10, 4, 18, 45).toISOString()
        );
    });

    test('every_n_days sends a number and no weekdays', () => {
        const payload = toPayload({ ...emptyDraft(), title: 'x', dueDate: '2026-11-03', repeatRule: 'every_n_days', every: '3', weekdays: ['mon'] });
        expect(payload.repeat).toEqual({ rule: 'every_n_days', every: 3 });
        expect(fromReminder({ ...REMINDER, repeat: { rule: 'every_n_days', every: 3, weekdays: [] } })).toMatchObject({
            repeatRule: 'every_n_days',
            every: '3',
            weekdays: [],
        });
    });

    test('weekly payload lists weekdays in week order', () => {
        const payload = toPayload({ ...emptyDraft(), title: 'x', repeatRule: 'weekly', weekdays: ['sun', 'mon'] });
        expect(payload.repeat).toEqual({ rule: 'weekly', weekdays: ['mon', 'sun'] });
    });

    test.each([
        ['blank title', { title: '   ' }, 'Title is required.'],
        ['due time without a date', { title: 'x', dueTime: '09:00' }, 'A due time needs a due date.'],
        ['every_n_days with no every', { title: 'x', repeatRule: 'every_n_days', every: '' }, 'Repeat every needs a number of days above 0.'],
        ['every_n_days with zero', { title: 'x', repeatRule: 'every_n_days', every: '0' }, 'Repeat every needs a number of days above 0.'],
        ['weekly with no weekday', { title: 'x', repeatRule: 'weekly', weekdays: [] }, 'Weekly needs at least one weekday.'],
    ])('validate rejects %s', (_name, changes, message) => {
        expect(validate({ ...emptyDraft(), ...changes })).toEqual([message]);
    });

    test('validate accepts a complete draft', () => {
        expect(validate(fromReminder(REMINDER))).toEqual([]);
        expect(validate({ ...emptyDraft(), title: 'x', repeatRule: 'every_n_days', every: '2' })).toEqual([]);
    });
});
