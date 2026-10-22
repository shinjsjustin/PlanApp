import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReminderRow from './ReminderRow';

// The row formats alerts in the browser zone; make that zone Los Angeles whatever the machine uses.
const RealDateTimeFormat = Intl.DateTimeFormat;
beforeEach(() => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
        (locale, options) => new RealDateTimeFormat(locale, { ...options, timeZone: (options && options.timeZone) || 'America/Los_Angeles' }),
    );
});
afterEach(() => jest.restoreAllMocks());

const full = {
    id: 41,
    title: 'Drop off paperwork',
    place: { id: 3, label: 'Head office' },
    subcategory: { id: 7, label: 'Front desk' },
    person: { id: 12, label: 'Ada Lovelace' },
    project: { id: 2, label: 'Move office' },
    todo: { id: 9, label: 'Sign forms' },
    dueDate: '2026-11-03',
    dueTime: '09:30',
    timeZone: 'America/Los_Angeles',
    alertAt: '2026-11-03T16:00:00.000Z',
    trigger: 'arrive',
    priority: 'high',
    status: 'open',
    snoozedUntil: '2026-11-03T17:00:00.000Z',
    repeat: { rule: 'weekly', every: null, weekdays: ['mon', 'thu'] },
    overdue: true,
};
const bare = {
    id: 1, title: 'Plain', place: null, subcategory: null, person: null, project: null, todo: null,
    dueDate: null, dueTime: null, timeZone: 'UTC', alertAt: null, trigger: 'none', priority: 'normal',
    status: 'open', snoozedUntil: null, repeat: { rule: 'none', every: null, weekdays: [] }, overdue: false,
};
const handlers = () => ({
    onDone: jest.fn(), onDismiss: jest.fn(), onSnooze: jest.fn(), onReopen: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn(),
});

it('shows every field of a fully set reminder', () => {
    const { container } = render(<ReminderRow reminder={full} {...handlers()} />);
    const text = container.textContent;

    ['Drop off paperwork', 'Head office', 'Front desk', 'Tue 3 Nov, 09:30', 'Tue 3 Nov, 08:00',
        'Arrive', 'High priority', 'Ada Lovelace', 'Move office', 'Sign forms', 'Weekly: Mon, Thu',
        'Snoozed until Tue 3 Nov, 09:00', 'Overdue'].forEach((s) => expect(text).toContain(s));
});

it('renders unset fields as nothing and no badges', () => {
    const { container } = render(<ReminderRow reminder={bare} {...handlers()} />);

    expect(container.textContent).toBe('PlainDoneDismissSnoozeEdit');
});

it('calls the matching prop with the reminder from each open button', () => {
    const h = handlers();
    render(<ReminderRow reminder={full} {...h} />);

    [['Done', 'onDone'], ['Dismiss', 'onDismiss'], ['Snooze', 'onSnooze'], ['Edit', 'onEdit']]
        .forEach(([name, prop]) => {
            fireEvent.click(screen.getByRole('button', { name }));
            expect(h[prop]).toHaveBeenCalledWith(full);
        });
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
});

it('offers only Done, Dismiss, Snooze and Edit on an open row', () => {
    render(<ReminderRow reminder={full} {...handlers()} />);

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Done', 'Dismiss', 'Snooze', 'Edit']);
});

it.each(['done', 'dismissed'])('offers only Reopen and Delete on a %s row', (status) => {
    const h = handlers();
    const reminder = { ...bare, status };
    render(<ReminderRow reminder={reminder} {...h} />);

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Reopen', 'Delete']);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(h.onReopen).toHaveBeenCalledWith(reminder);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(h.onDelete).toHaveBeenCalledWith(reminder);
});

it('raises no duplicate-key warning when place and subcategory share a label', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const reminder = { ...bare, place: { id: 3, label: 'Office' }, subcategory: { id: 7, label: 'Office' } };
    render(<ul><ReminderRow reminder={reminder} {...handlers()} /></ul>);
    expect(screen.getAllByText('Office')).toHaveLength(2);
    expect(errorSpy).not.toHaveBeenCalled();
});
