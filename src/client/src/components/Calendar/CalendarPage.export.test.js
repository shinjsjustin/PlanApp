import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const datedDay = { id: 1, position: 0, date: '2026-10-15', createdAt: '2026-09-16T08:00:00.000Z' };
const undatedDay = { id: 2, position: 1, createdAt: '2026-09-16T08:00:00.000Z' };

let calendarAnswer;

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

const exportButton = () => screen.findByRole('button', { name: 'Export to Google' });

beforeEach(() => {
    jest.clearAllMocks();
    calendarAnswer = { days: [datedDay], items: [] };
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
        if (path === '/calendar') return Promise.resolve(calendarAnswer);
        if (path === '/calendar/events') return Promise.resolve({ events: [] });
        return Promise.resolve([]);
    });
});

describe('CalendarPage export', () => {
    test('the button POSTs an empty body and a success shows the counts in a status', async () => {
        api.post.mockResolvedValue({ created: 2, updated: 1, deleted: 3 });
        renderPage();

        await userEvent.click(await exportButton());

        expect(api.post).toHaveBeenCalledWith('/calendar/export', {});
        const line = await screen.findByText('Exported: 2 new, 1 moved, 3 removed');
        expect(line).toHaveAttribute('role', 'status');
    });

    test('the button is disabled while exporting', async () => {
        api.post.mockReturnValue(new Promise(() => {}));
        renderPage();

        await userEvent.click(await exportButton());

        expect(screen.getByRole('button', { name: 'Export to Google' })).toBeDisabled();
    });

    test('the button is disabled when no day has a date', async () => {
        calendarAnswer = { days: [undatedDay], items: [] };
        renderPage();

        expect(await exportButton()).toBeDisabled();
    });

    test('a failed export shows its message in the alert and Dismiss clears it', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        api.post.mockRejectedValue(new Error('Google not connected'));
        renderPage();

        await userEvent.click(await exportButton());

        const alert = (await screen.findByText('Google not connected')).closest('[role="alert"]');
        expect(alert).toBeVisible();
        expect(screen.queryByText(/^Exported:/)).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));

        await waitFor(() =>
            expect(screen.queryByText('Google not connected')).not.toBeInTheDocument()
        );
        console.error.mockRestore();
    });
});
