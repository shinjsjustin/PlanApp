import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChoreHistory from './ChoreHistory';
import useChoreLogs from '../../hooks/useChoreLogs';
import { todayKey } from '../../lib/dates';

jest.mock('../../hooks/useChoreLogs');

const chore = { id: 5, name: 'Clean bathrooms' };
const logs = [
    { id: 1, on: '2026-10-20', by: 'Jacklin' },
    { id: 2, on: '2026-10-10', by: 'Justin' },
];
let hook;
const setup = (overrides = {}) => {
    hook = {
        status: 'ready', logs, error: null,
        add: jest.fn().mockResolvedValue(true),
        edit: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(true),
        ...overrides,
    };
    useChoreLogs.mockReturnValue(hook);
    const onChanged = jest.fn();
    const view = render(<ChoreHistory chore={chore} onChanged={onChanged} />);
    return { onChanged, ...view };
};

afterEach(() => jest.restoreAllMocks());

it('loads logs for the chore and lists each as "<on> by <by>"', () => {
    const { container } = setup();
    expect(useChoreLogs).toHaveBeenCalledWith(5);
    const items = container.querySelectorAll('ul.chore-history > li');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('2026-10-20 by Jacklin');
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
});

it('shows the empty message, loading text and the error alert', () => {
    setup({ logs: [] });
    expect(screen.getByText('No done-marks yet.')).toBeInTheDocument();
    setup({ status: 'loading', logs: [] });
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    setup({ error: 'Boom' });
    expect(screen.getByRole('alert')).toHaveClass('places-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
});

it('add form defaults to today and Justin, caps both, and calls add then onChanged', async () => {
    const { onChanged } = setup();
    const date = screen.getByLabelText('Date');
    const by = screen.getByLabelText('Done by');
    expect(date).toHaveValue(todayKey());
    expect(date).toHaveAttribute('max', todayKey());
    expect(by).toHaveValue('Justin');
    expect(by).toHaveAttribute('maxlength', '50');
    fireEvent.change(date, { target: { value: '2026-10-01' } });
    fireEvent.change(by, { target: { value: 'Jacklin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(hook.add).toHaveBeenCalledWith({ on: '2026-10-01', by: 'Jacklin' });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
});

it('does not submit a blank name', () => {
    const { onChanged } = setup();
    fireEvent.change(screen.getByLabelText('Done by'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(hook.add).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
});

it('does not call onChanged when add fails', async () => {
    const { onChanged } = setup({ add: jest.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(hook.add).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
});

it('edits a row: Save calls edit with on/by then onChanged', async () => {
    const { onChanged } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const inputs = screen.getAllByLabelText(/Date|Done by/);
    expect(inputs).toHaveLength(4);
    const row = screen.getByRole('button', { name: 'Save' }).closest('li');
    const [d, b] = row.querySelectorAll('input');
    expect(d).toHaveValue('2026-10-20');
    expect(b).toHaveValue('Jacklin');
    fireEvent.change(d, { target: { value: '2026-10-19' } });
    fireEvent.change(b, { target: { value: 'Justin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(hook.edit).toHaveBeenCalledWith(1, { on: '2026-10-19', by: 'Justin' });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
});

it('Cancel leaves edit mode without calling edit', () => {
    const { container } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(hook.edit).not.toHaveBeenCalled();
    expect(container.querySelector('ul.chore-history')).toHaveTextContent('2026-10-20 by Jacklin');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});

it('Delete confirms, and only on yes removes then calls onChanged', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { onChanged } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    expect(confirm).toHaveBeenCalledWith('Delete this done-mark?');
    expect(hook.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    expect(hook.remove).toHaveBeenCalledWith(2);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
});

it('does not call onChanged when delete fails', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { onChanged } = setup({ remove: jest.fn().mockResolvedValue(false), error: 'Nope' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => expect(hook.remove).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Nope');
});
