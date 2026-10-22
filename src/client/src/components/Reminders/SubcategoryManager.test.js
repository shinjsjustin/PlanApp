import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SubcategoryManager from './SubcategoryManager';
import useReminderSubcategories from '../../hooks/useReminderSubcategories';

jest.mock('../../hooks/useReminderSubcategories');

let hook;
const onChanged = jest.fn();

beforeEach(() => {
    onChanged.mockClear();
    hook = {
        status: 'ready', error: null,
        subcategories: [{ id: 7, placeId: 3, name: 'Front desk' }, { id: 8, placeId: 3, name: 'Dock' }],
        add: jest.fn().mockResolvedValue(true),
        rename: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(true),
    };
    useReminderSubcategories.mockImplementation(() => hook);
});

describe('SubcategoryManager', () => {
    test('lists the place subcategories for the given place', () => {
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        expect(useReminderSubcategories).toHaveBeenLastCalledWith(3);
        expect(screen.getByText('Front desk')).toBeInTheDocument();
        expect(screen.getByText('Dock')).toBeInTheDocument();
    });

    test('adds a trimmed name and clears the input', async () => {
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        const input = screen.getByLabelText('New subcategory');
        await userEvent.type(input, '  Loading bay ');
        await userEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(hook.add).toHaveBeenCalledWith({ name: 'Loading bay' });
        await waitFor(() => expect(input).toHaveValue(''));
        expect(onChanged).not.toHaveBeenCalled();
    });

    test('refuses a blank name before any request', async () => {
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        await userEvent.type(screen.getByLabelText('New subcategory'), '   ');
        await userEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(hook.add).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    });

    test('keeps the typed name when add fails and shows the server message', async () => {
        hook.add.mockResolvedValue(false);
        hook.error = 'Name already exists';
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        const input = screen.getByLabelText('New subcategory');
        await userEvent.type(input, 'Dock');
        await userEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(input).toHaveValue('Dock');
        expect(screen.getByRole('alert')).toHaveTextContent('Name already exists');
    });

    test('renames inline and reports the change', async () => {
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]);
        const input = screen.getByLabelText('Rename Front desk');
        expect(input).toHaveValue('Front desk');
        await userEvent.clear(input);
        await userEvent.type(input, 'Reception');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(hook.rename).toHaveBeenCalledWith(7, 'Reception');
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(screen.queryByLabelText('Rename Front desk')).not.toBeInTheDocument();
    });

    test('a blank rename is refused and a failed rename stays open without reporting', async () => {
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]);
        const input = screen.getByLabelText('Rename Front desk');
        await userEvent.clear(input);
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(hook.rename).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Name is required');

        hook.rename.mockResolvedValue(false);
        await userEvent.type(input, 'Dock');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(hook.rename).toHaveBeenCalledWith(7, 'Dock');
        expect(onChanged).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Rename Front desk')).toBeInTheDocument();
    });

    test('delete asks first, then removes and reports the change', async () => {
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
        expect(hook.remove).not.toHaveBeenCalled();
        confirm.mockReturnValue(true);
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
        expect(hook.remove).toHaveBeenCalledWith(8);
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        confirm.mockRestore();
    });

    test('a failed delete does not report a change', async () => {
        hook.remove.mockResolvedValue(false);
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
        expect(onChanged).not.toHaveBeenCalled();
        confirm.mockRestore();
    });

    test('shows the hook error when loading failed', () => {
        hook.status = 'error';
        hook.error = 'Could not load';
        render(<SubcategoryManager placeId={3} onChanged={onChanged} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    });
});
