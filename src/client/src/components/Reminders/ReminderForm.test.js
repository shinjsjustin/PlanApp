import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../../lib/api';
import ReminderForm from './ReminderForm';

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn() },
}));

const PLACES = [
    { id: 3, name: 'Head office' },
    { id: 4, name: 'Shop' },
];
const SUBCATEGORIES = { 3: [{ id: 7, name: 'Front desk' }], 4: [{ id: 8, name: 'Back room' }] };
const PEOPLE = [{ id: 12, name: 'Ada' }];
const PROJECTS = [{ id: 5, title: 'Move' }, { id: 6, title: 'Paint' }];
const TODOS = { 5: [{ id: 9, text: 'Boxes' }], 6: [{ id: 10, text: 'Brushes' }] };

const REMINDER = {
    id: 41,
    title: 'Drop off',
    place: { id: 3, label: 'Head office' },
    subcategory: { id: 7, label: 'Front desk' },
    person: { id: 12, label: 'Ada' },
    project: { id: 5, label: 'Move' },
    todo: { id: 9, label: 'Boxes' },
    dueDate: '2026-11-03',
    dueTime: '09:30',
    alertAt: null,
    trigger: 'arrive',
    priority: 'high',
    repeat: { rule: 'none', every: null, weekdays: [] },
};

beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation(async (path) => {
        if (path === '/places') return { places: PLACES, startPlaceId: null };
        if (path === '/people') return { people: PEOPLE };
        if (path === '/projects') return PROJECTS;
        const projectMatch = path.match(/^\/projects\/(\d+)$/);
        if (projectMatch) return { project: {}, todos: TODOS[projectMatch[1]] };
        const subMatch = path.match(/^\/reminder-subcategories\?placeId=(\d+)$/);
        if (subMatch) return { subcategories: SUBCATEGORIES[subMatch[1]] };
        throw new Error(`unexpected ${path}`);
    });
});

const renderForm = async (props = {}) => {
    const onSubmit = jest.fn();
    render(<ReminderForm onSubmit={onSubmit} {...props} />);
    await screen.findByRole('option', { name: 'Shop' });
    await screen.findByRole('option', { name: 'Paint' });
    await screen.findByRole('option', { name: 'Ada' });
    return onSubmit;
};

const optionNames = (label) =>
    Array.from(screen.getByLabelText(label).querySelectorAll('option')).map((o) => o.textContent);

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('ReminderForm', () => {
    test('has every labelled control and a disabled subcategory with no place', async () => {
        await renderForm();
        ['Title', 'Place', 'Subcategory', 'Due date', 'Due time', 'Alert', 'Trigger', 'Priority', 'Person', 'Project', 'To-do', 'Repeat']
            .forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument());
        expect(screen.getByLabelText('Subcategory')).toBeDisabled();
        expect(screen.getByLabelText('To-do')).toBeDisabled();
        expect(screen.getByLabelText('Alert')).toHaveAttribute('type', 'datetime-local');
        expect(optionNames('Trigger')).toEqual(['None', 'Arrive', 'Leave']);
        expect(optionNames('Priority')).toEqual(['Normal', 'High']);
        expect(screen.queryByRole('checkbox', { name: 'Mon' })).not.toBeInTheDocument();
    });

    test('lists only the chosen place subcategories', async () => {
        await renderForm();
        await userEvent.selectOptions(screen.getByLabelText('Place'), 'Shop');
        await screen.findByRole('option', { name: 'Back room' });
        expect(screen.getByLabelText('Subcategory')).toBeEnabled();
        expect(optionNames('Subcategory')).toEqual(['No subcategory', 'Back room']);
    });

    test('changing the place clears the subcategory', async () => {
        const onSubmit = await renderForm({ reminder: REMINDER });
        await screen.findByRole('option', { name: 'Front desk' });
        await userEvent.selectOptions(screen.getByLabelText('Place'), 'Shop');
        await screen.findByRole('option', { name: 'Back room' });
        expect(screen.getByLabelText('Subcategory')).toHaveValue('');
        await save();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ placeId: 4, subcategoryId: null }));
    });

    test('changing the project clears the to-do and lists that project to-dos', async () => {
        const onSubmit = await renderForm({ reminder: REMINDER });
        await screen.findByRole('option', { name: 'Boxes' });
        await userEvent.selectOptions(screen.getByLabelText('Project'), 'Paint');
        await screen.findByRole('option', { name: 'Brushes' });
        expect(screen.getByLabelText('To-do')).toHaveValue('');
        await save();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: 6, todoId: null }));
    });

    test('submits the payload of an edited reminder unchanged', async () => {
        const onSubmit = await renderForm({ reminder: REMINDER });
        await screen.findByRole('option', { name: 'Boxes' });
        await save();
        expect(onSubmit).toHaveBeenCalledWith({
            title: 'Drop off',
            placeId: 3,
            subcategoryId: 7,
            personId: 12,
            projectId: 5,
            todoId: 9,
            dueDate: '2026-11-03',
            dueTime: '09:30',
            alertAt: null,
            trigger: 'arrive',
            priority: 'high',
            repeat: { rule: 'none' },
        });
    });

    test('weekly shows weekday checkboxes and every_n_days shows a days field', async () => {
        const onSubmit = await renderForm();
        await userEvent.type(screen.getByLabelText('Title'), 'Water plants');
        await userEvent.type(screen.getByLabelText('Due date'), '2026-11-03');
        await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'Weekly');
        await userEvent.click(screen.getByRole('checkbox', { name: 'Thu' }));
        await userEvent.click(screen.getByRole('checkbox', { name: 'Mon' }));
        await save();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ repeat: { rule: 'weekly', weekdays: ['mon', 'thu'] } }));

        await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'Every n days');
        expect(screen.queryByRole('checkbox', { name: 'Mon' })).not.toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('Every (days)'), '3');
        await save();
        expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ repeat: { rule: 'every_n_days', every: 3 } }));
    });

    test('an invalid draft is not submitted and shows each error', async () => {
        const onSubmit = await renderForm();
        await userEvent.type(screen.getByLabelText('Due time'), '09:00');
        await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'Weekly');
        await save();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText('Title is required.')).toBeInTheDocument();
        expect(screen.getByText('A due time needs a due date.')).toBeInTheDocument();
        expect(screen.getByText('Weekly needs at least one weekday.')).toBeInTheDocument();
    });

    test('reports dirtiness, cancel, and a failed save', async () => {
        const onDirtyChange = jest.fn();
        const onCancel = jest.fn();
        await renderForm({ onDirtyChange, onCancel, saveFailed: true });
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        await userEvent.type(screen.getByLabelText('Title'), 'x');
        await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
        expect(screen.getByText('Could not save the reminder. Please try again.')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalled();
    });

    test('shows a message when the projects cannot be loaded', async () => {
        api.get.mockImplementation(async (path) => {
            if (path === '/projects') throw new Error('boom');
            if (path === '/places') return { places: PLACES, startPlaceId: null };
            if (path === '/people') return { people: PEOPLE };
            throw new Error(`unexpected ${path}`);
        });
        render(<ReminderForm onSubmit={jest.fn()} />);
        expect(await screen.findByText('boom')).toBeInTheDocument();
    });

    test('shows a Delete button that calls onDelete only when given one', async () => {
        const onDelete = jest.fn();
        await renderForm({ reminder: REMINDER, onDelete });
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    test('has no Delete button without onDelete', async () => {
        await renderForm({ reminder: REMINDER });
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });
});
