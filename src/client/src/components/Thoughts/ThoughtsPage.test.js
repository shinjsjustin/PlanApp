import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import ThoughtsPage from './ThoughtsPage';
import useThoughts from '../../hooks/useThoughts';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useThoughts');
jest.mock('../../hooks/useIsPhone');

const NEWER = { id: 2, text: 'second thought', createdAt: '2026-10-02T10:00:00.000Z' };
const OLDER = { id: 1, text: 'first thought', createdAt: '2026-10-01T09:30:00.000Z' };

let hook;

const renderPage = () => render(<ThoughtsPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    hook = {
        status: 'ready',
        thoughts: [NEWER, OLDER],
        error: null,
        add: jest.fn(),
        edit: jest.fn(),
        remove: jest.fn(),
        clearAll: jest.fn(),
    };
    useThoughts.mockImplementation(() => hook);
    useIsPhone.mockReturnValue(false);
});

describe('ThoughtsPage', () => {
    test('shows heading and header links on desktop, no links on a phone', () => {
        const { unmount } = renderPage();
        expect(screen.getByRole('heading', { name: 'Thoughts' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /projects/i })).toHaveAttribute('href', '/projects');
        expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/calendar');
        unmount();

        useIsPhone.mockReturnValue(true);
        renderPage();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('autofocuses the textarea', () => {
        renderPage();
        expect(screen.getByRole('textbox', { name: /new thought/i })).toHaveFocus();
    });

    test('Save adds the text and clears the box', async () => {
        renderPage();
        const box = screen.getByRole('textbox', { name: /new thought/i });
        await userEvent.type(box, 'buy milk');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(hook.add).toHaveBeenCalledWith('buy milk');
        expect(box).toHaveValue('');
    });

    test('Enter adds the text, Shift+Enter does not', async () => {
        renderPage();
        const box = screen.getByRole('textbox', { name: /new thought/i });
        await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b');
        expect(hook.add).not.toHaveBeenCalled();
        await userEvent.type(box, '{Enter}');
        expect(hook.add).toHaveBeenCalledWith('a\nb');
        expect(box).toHaveValue('');
    });

    test('Save is disabled while the text is blank', async () => {
        renderPage();
        const save = screen.getByRole('button', { name: 'Save' });
        expect(save).toBeDisabled();
        await userEvent.type(screen.getByRole('textbox', { name: /new thought/i }), '   ');
        expect(save).toBeDisabled();
        await userEvent.type(screen.getByRole('textbox', { name: /new thought/i }), 'x');
        expect(save).toBeEnabled();
    });

    test('lists thoughts newest first with local createdAt', () => {
        renderPage();
        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(within(items[0]).getByText('second thought')).toBeInTheDocument();
        expect(within(items[0]).getByText(new Date(NEWER.createdAt).toLocaleString())).toBeInTheDocument();
        expect(within(items[1]).getByText('first thought')).toBeInTheDocument();
        expect(within(items[1]).getByText(new Date(OLDER.createdAt).toLocaleString())).toBeInTheDocument();
    });

    test('Edit turns a thought into a text box whose Save calls edit', async () => {
        renderPage();
        const item = screen.getAllByRole('listitem')[1];
        await userEvent.click(within(item).getByRole('button', { name: 'Edit' }));
        const box = within(item).getByRole('textbox');
        expect(box).toHaveValue('first thought');
        await userEvent.clear(box);
        await userEvent.type(box, 'changed');
        await userEvent.click(within(item).getByRole('button', { name: 'Save' }));

        expect(hook.edit).toHaveBeenCalledWith(1, 'changed');
        expect(within(item).queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('Delete calls remove with the id', async () => {
        renderPage();
        const item = screen.getAllByRole('listitem')[0];
        await userEvent.click(within(item).getByRole('button', { name: 'Delete' }));
        expect(hook.remove).toHaveBeenCalledWith(2);
    });

    test('Clear all confirms and calls clearAll only when accepted', async () => {
        const confirm = jest.spyOn(window, 'confirm');
        renderPage();

        confirm.mockReturnValue(false);
        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
        expect(confirm).toHaveBeenCalledWith('Delete every thought?');
        expect(hook.clearAll).not.toHaveBeenCalled();

        confirm.mockReturnValue(true);
        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
        expect(hook.clearAll).toHaveBeenCalledTimes(1);
        confirm.mockRestore();
    });

    test('hides Clear all when there are no thoughts', () => {
        hook.thoughts = [];
        renderPage();
        expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    });

    test('shows a loading state instead of the list', () => {
        hook.status = 'loading';
        hook.thoughts = [];
        renderPage();
        expect(screen.getByText('Loading thoughts…')).toBeInTheDocument();
    });

    test('shows the hook error in an alert', () => {
        hook.error = 'Could not reach the server';
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    });
});
