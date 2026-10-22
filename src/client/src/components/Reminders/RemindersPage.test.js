import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RemindersPage from './RemindersPage';
import useReminders from '../../hooks/useReminders';
import usePlaces from '../../hooks/usePlaces';

jest.mock('../../hooks/useReminders');
jest.mock('../../hooks/usePlaces');
jest.mock('./SubcategoryManager', () => ({ placeId, onChanged }) => (
    <div>
        <p>{`subcategories of ${placeId}`}</p>
        <button type="button" onClick={onChanged}>Changed</button>
    </div>
));
jest.mock('./ReminderForm', () => ({ reminder, onSubmit, onCancel, onDelete, saveFailed }) => (
    <div>
        <p>{reminder ? `form for ${reminder.title}` : 'blank form'}</p>
        {saveFailed && <p>save failed</p>}
        <button type="button" onClick={() => onSubmit({ title: 'Saved' })}>Save</button>
        <button type="button" onClick={onCancel}>Cancel form</button>
        {onDelete && <button type="button" onClick={onDelete}>Delete</button>}
    </div>
));

const HOME = { id: 1, name: 'Home' };
const SHOP = { id: 2, name: 'Shop' };
const reminder = (id, title, status = 'open') => ({
    id, title, status, place: null, subcategory: null, person: null, project: null, todo: null,
    dueDate: null, dueTime: null, alertAt: null, trigger: 'none', priority: 'normal',
    snoozedUntil: null, repeat: { rule: 'none', every: null, weekdays: [] }, overdue: false,
});

let hook;

beforeEach(() => {
    hook = {
        status: 'ready', reminders: [reminder(1, 'Buy milk')], error: null,
        add: jest.fn().mockResolvedValue(true), edit: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(true), done: jest.fn().mockResolvedValue(true),
        dismiss: jest.fn().mockResolvedValue(true), reopen: jest.fn().mockResolvedValue(true),
        snooze: jest.fn().mockResolvedValue(true), reload: jest.fn(),
    };
    useReminders.mockImplementation(() => hook);
    usePlaces.mockReturnValue({ status: 'ready', places: [HOME, SHOP], error: null });
});

const lastQuery = () => useReminders.mock.calls[useReminders.mock.calls.length - 1][0];

describe('RemindersPage', () => {
    test('shows the heading, default query and the reminders', () => {
        render(<RemindersPage />);
        expect(screen.getByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
        expect(screen.getByText('Buy milk')).toBeInTheDocument();
        expect(lastQuery()).toEqual({ placeId: undefined, status: 'open', sort: 'due' });
    });

    test('place filter offers All, each place and No place and queries by place', async () => {
        render(<RemindersPage />);
        const select = screen.getByLabelText('Place');
        expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['All', 'Home', 'Shop', 'No place']);
        await userEvent.selectOptions(select, 'Shop');
        expect(lastQuery().placeId).toBe(2);
        await userEvent.selectOptions(select, 'No place');
        expect(lastQuery().placeId).toBe('none');
        await userEvent.selectOptions(select, 'All');
        expect(lastQuery().placeId).toBeUndefined();
    });

    test('view buttons map to open, snoozed and history', async () => {
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Snoozed' }));
        expect(lastQuery().status).toBe('snoozed');
        await userEvent.click(screen.getByRole('button', { name: 'History' }));
        expect(lastQuery().status).toBe('history');
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));
        expect(lastQuery().status).toBe('open');
    });

    test('sort select offers the four sorts with due first', async () => {
        render(<RemindersPage />);
        const select = screen.getByLabelText('Sort');
        expect(within(select).getAllByRole('option').map((o) => o.value)).toEqual(['due', 'place', 'subcategory', 'created']);
        await userEvent.selectOptions(select, 'subcategory');
        expect(lastQuery().sort).toBe('subcategory');
    });

    test('New reminder saves through add and closes on success', async () => {
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'New reminder' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(hook.add).toHaveBeenCalledWith({ title: 'Saved' });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('a failed save keeps the dialog open and shows the hook error', async () => {
        hook.add.mockResolvedValue(false);
        hook.error = 'Title is too long';
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'New reminder' }));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(await within(screen.getByRole('dialog')).findByText('Title is too long')).toBeInTheDocument();
        expect(await screen.findByText('save failed')).toBeInTheDocument();
    });

    test('Edit opens the form with the reminder and saves through edit', async () => {
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(screen.getByText('form for Buy milk')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(hook.edit).toHaveBeenCalledWith(1, { title: 'Saved' });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('Delete in the edit dialog removes only after confirming and closes the dialog', async () => {
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        render(<RemindersPage />);
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(confirm).toHaveBeenCalledWith('Delete this reminder?');
        expect(hook.remove).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        confirm.mockReturnValue(true);
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(hook.remove).toHaveBeenCalledWith(1);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        confirm.mockRestore();
    });

    test('Delete on a done row removes only after confirming', async () => {
        hook.reminders = [reminder(5, 'Old task', 'done')];
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(confirm).toHaveBeenCalledWith('Delete this reminder?');
        expect(hook.remove).not.toHaveBeenCalled();
        confirm.mockReturnValue(true);
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(hook.remove).toHaveBeenCalledWith(5);
        confirm.mockRestore();
    });

    test('the new reminder form offers no Delete', async () => {
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'New reminder' }));
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    test('Done and Dismiss call their actions', async () => {
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(hook.done).toHaveBeenCalledWith(1);
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(hook.dismiss).toHaveBeenCalledWith(1);
    });

    test('Reopen calls reopen for a closed reminder', async () => {
        hook.reminders = [reminder(5, 'Old', 'done')];
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
        expect(hook.reopen).toHaveBeenCalledWith(5);
    });

    test('Snooze opens the dialog and sends a future ISO instant, then closes', async () => {
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Snooze' }));
        await userEvent.click(screen.getByRole('button', { name: '1 hour' }));
        expect(hook.snooze).toHaveBeenCalledTimes(1);
        const [id, until] = hook.snooze.mock.calls[0];
        expect(id).toBe(1);
        expect(until).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
        expect(new Date(until).getTime()).toBeGreaterThan(Date.now());
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('a failed snooze keeps the dialog open', async () => {
        hook.snooze.mockResolvedValue(false);
        hook.error = 'Already snoozed';
        render(<RemindersPage />);
        await userEvent.click(screen.getByRole('button', { name: 'Snooze' }));
        await userEvent.click(screen.getByRole('button', { name: '1 hour' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(await within(screen.getByRole('dialog')).findByText('Already snoozed')).toBeInTheDocument();
    });

    test('a failed action shows the hook error on the page', async () => {
        hook.error = 'Reminder is not open';
        render(<RemindersPage />);
        expect(screen.getByRole('alert')).toHaveTextContent('Reminder is not open');
    });

    test('loading, empty and load error states show text', () => {
        hook.status = 'loading';
        const { rerender } = render(<RemindersPage />);
        expect(screen.getByText('Loading reminders...')).toBeInTheDocument();
        hook.status = 'ready';
        hook.reminders = [];
        rerender(<RemindersPage />);
        expect(screen.getByText('No reminders here.')).toBeInTheDocument();
        hook.status = 'error';
        hook.error = 'Could not load';
        rerender(<RemindersPage />);
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
        expect(screen.queryByText('No reminders here.')).not.toBeInTheDocument();
    });

    test('shows the subcategory manager only when one place is filtered', async () => {
        render(<RemindersPage />);
        const select = screen.getByLabelText('Place');
        expect(screen.queryByText(/subcategories of/)).not.toBeInTheDocument();
        await userEvent.selectOptions(select, 'Shop');
        expect(screen.getByText('subcategories of 2')).toBeInTheDocument();
        await userEvent.selectOptions(select, 'No place');
        expect(screen.queryByText(/subcategories of/)).not.toBeInTheDocument();
        await userEvent.selectOptions(select, 'Home');
        expect(screen.getByText('subcategories of 1')).toBeInTheDocument();
        await userEvent.selectOptions(select, 'All');
        expect(screen.queryByText(/subcategories of/)).not.toBeInTheDocument();
    });

    test('reloads reminders when the manager reports a change', async () => {
        render(<RemindersPage />);
        await userEvent.selectOptions(screen.getByLabelText('Place'), 'Shop');
        expect(hook.reload).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Changed' }));
        expect(hook.reload).toHaveBeenCalledTimes(1);
    });

    describe('date groups', () => {
        const dated = (id, title, dueDate) => ({ ...reminder(id, title), dueDate });
        const headings = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);

        beforeEach(() => {
            hook.reminders = [dated(1, 'Late', '2000-01-01'), dated(2, 'Far', '2999-01-01'), reminder(3, 'Someday')];
        });

        test('Open sorted by Due groups under headings for the groups present', () => {
            render(<RemindersPage />);
            expect(headings()).toEqual(['Overdue', 'Upcoming', 'No date']);
            expect(document.querySelectorAll('ul.reminder-list')).toHaveLength(3);
        });

        test('Place sort shows a flat list with no headings', async () => {
            render(<RemindersPage />);
            await userEvent.selectOptions(screen.getByLabelText('Sort'), 'place');
            expect(headings()).toEqual([]);
            expect(document.querySelectorAll('ul.reminder-list')).toHaveLength(1);
        });

        test('Snoozed and History views show no headings', async () => {
            render(<RemindersPage />);
            await userEvent.click(screen.getByRole('button', { name: 'History' }));
            expect(headings()).toEqual([]);
            await userEvent.click(screen.getByRole('button', { name: 'Snoozed' }));
            expect(headings()).toEqual([]);
        });
    });
});
