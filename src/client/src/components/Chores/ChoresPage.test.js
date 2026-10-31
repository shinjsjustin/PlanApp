import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import ChoresPage from './ChoresPage';
import useChores from '../../hooks/useChores';

jest.mock('../../hooks/useChores');
jest.mock('./ChoreForm', () => ({ chore, onSubmit, onCancel, saveFailed }) => (
    <div>
        <p>{chore ? `form for ${chore.name}` : 'blank form'}</p>
        {saveFailed && <p>save failed</p>}
        <button type="button" onClick={() => onSubmit({ name: 'Saved' })}>Save</button>
        <button type="button" onClick={onCancel}>Cancel form</button>
    </div>
));

const chore = (id, name, status) => ({ id, name, status, area: null, window: { min: 7, max: 14 }, lastDone: null });
const UNDO_MS = 10000;

let hook;
let pending;

const flush = () => act(async () => {});
const tapDone = async (index = 0) => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[index]);
    await flush();
};

beforeEach(() => {
    jest.useFakeTimers();
    pending = null;
    hook = {
        status: 'ready', error: null,
        chores: [chore(1, 'Clean bathrooms', 'overdue'), chore(2, 'Dust', 'upcoming'), chore(3, 'Mop', 'never')],
        add: jest.fn().mockResolvedValue(true), edit: jest.fn().mockResolvedValue(true),
        markDone: jest.fn(async (id) => (pending ? pending : { id: 100 + id })),
        undo: jest.fn().mockResolvedValue(true), reload: jest.fn(),
    };
    useChores.mockImplementation(() => hook);
});

afterEach(() => jest.useRealTimers());

describe('ChoresPage', () => {
    test('shows heading, New chore button and the non-empty groups in order', () => {
        render(<ChoresPage />);
        expect(screen.getByRole('heading', { level: 1, name: 'Chores' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New chore' })).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent))
            .toEqual(['Overdue', 'Coming up', 'Never done']);
    });

    test('shows No chores yet. when the list is empty', () => {
        hook.chores = [];
        render(<ChoresPage />);
        expect(screen.getByText('No chores yet.')).toBeInTheDocument();
    });

    test('shows loading text and the error alert', () => {
        hook.status = 'loading';
        hook.error = 'Boom';
        render(<ChoresPage />);
        expect(screen.getByText('Loading chores...')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    });

    test('Done by offers Justin, Jacklin and Other and defaults to Justin', async () => {
        render(<ChoresPage />);
        const select = screen.getByLabelText('Done by');
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Justin', 'Jacklin', 'Other']);
        expect(select).toHaveValue('Justin');
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Justin');
    });

    test('Done uses the chosen person', async () => {
        render(<ChoresPage />);
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Jacklin' } });
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Jacklin');
    });

    test('Other reveals a 50 char name field whose trimmed value is used', async () => {
        render(<ChoresPage />);
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Other' } });
        const input = screen.getByLabelText('Name');
        expect(input).toHaveAttribute('maxLength', '50');
        fireEvent.change(input, { target: { value: '  Grandma ' } });
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Grandma');
    });

    test('Other with a blank name falls back to Justin', async () => {
        render(<ChoresPage />);
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Other' } });
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Justin');
    });

    test('a successful Done shows an Undo bar that calls undo and clears', async () => {
        render(<ChoresPage />);
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Jacklin' } });
        await tapDone();
        expect(screen.getByRole('status')).toHaveTextContent('Done: Clean bathrooms by Jacklin');
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(hook.undo).toHaveBeenCalledWith(1, 101);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('a failed Done shows no Undo bar', async () => {
        hook.markDone.mockResolvedValue(null);
        render(<ChoresPage />);
        await tapDone();
        expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    });

    test('Undo disappears after 10 seconds, not before', async () => {
        render(<ChoresPage />);
        await tapDone();
        act(() => { jest.advanceTimersByTime(UNDO_MS - 1); });
        expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
        act(() => { jest.advanceTimersByTime(1); });
        expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    });

    test('the next Done replaces the Undo bar and restarts the timer', async () => {
        render(<ChoresPage />);
        await tapDone(0);
        act(() => { jest.advanceTimersByTime(UNDO_MS - 1000); });
        hook.markDone.mockResolvedValueOnce(null);
        await tapDone(1);
        expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
        await tapDone(1);
        expect(screen.getByRole('status')).toHaveTextContent('Done: Dust');
        act(() => { jest.advanceTimersByTime(UNDO_MS - 1); });
        expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    });

    test('New chore opens the form and closes it after a successful add', async () => {
        render(<ChoresPage />);
        fireEvent.click(screen.getByRole('button', { name: 'New chore' }));
        expect(screen.getByText('blank form')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await flush();
        expect(hook.add).toHaveBeenCalledWith({ name: 'Saved' });
        expect(screen.queryByText('blank form')).not.toBeInTheDocument();
    });

    test('Edit submits through edit and a failure keeps the dialog with the error', async () => {
        hook.edit.mockResolvedValue(false);
        hook.error = 'Name taken';
        render(<ChoresPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
        expect(screen.getByText('form for Clean bathrooms')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await flush();
        expect(hook.edit).toHaveBeenCalledWith(1, { name: 'Saved' });
        expect(screen.getByText('form for Clean bathrooms')).toBeInTheDocument();
        expect(screen.getByText('save failed')).toBeInTheDocument();
        expect(screen.getAllByText('Name taken').length).toBeGreaterThan(1);
    });
});
