import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const days = [
    { id: 1, position: 0, date: '2026-10-15', createdAt: '2026-09-16T08:00:00.000Z' },
    { id: 2, position: 1, date: '2026-10-16', createdAt: '2026-09-16T08:00:00.000Z' },
];

const timed = { id: 'e1', dayId: 1, title: 'Dentist', allDay: false, startMinutes: 600, durationMinutes: 60 };
const chip = { id: 'e2', dayId: 2, title: 'Holiday', allDay: true, startMinutes: 0, durationMinutes: 1440 };

let calendarAnswer;
let eventsAnswer;

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    jest.clearAllMocks();
    calendarAnswer = { days, items: [] };
    eventsAnswer = { events: [timed, chip] };
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
        if (path === '/calendar') return Promise.resolve(calendarAnswer);
        if (path === '/calendar/events') return Promise.resolve(eventsAnswer);
        return Promise.resolve([]);
    });
});

describe('CalendarPage Google events', () => {
    test('draws each day its timed events and all-day chips', async () => {
        renderPage();

        const dayOne = await screen.findByRole('region', { name: 'Day 1' });
        expect(await within(dayOne).findByLabelText('Google event: Dentist')).toBeInTheDocument();
        const dayTwo = screen.getByRole('region', { name: 'Day 2' });
        expect(within(dayTwo).getByText('Holiday')).toBeInTheDocument();
        expect(within(dayTwo).queryByLabelText('Google event: Dentist')).not.toBeInTheDocument();
    });

    test('header button imports everything with an empty body', async () => {
        api.post.mockResolvedValue({ events: [] });
        renderPage();

        await userEvent.click(await screen.findByRole('button', { name: 'Import Google events' }));

        expect(api.post).toHaveBeenCalledWith('/calendar/events/import', {});
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Import Google events' })).toBeEnabled()
        );
    });

    test('a day button imports just that day', async () => {
        api.post.mockResolvedValue({ events: [] });
        renderPage();

        const dayTwo = await screen.findByRole('region', { name: 'Day 2' });
        await userEvent.click(within(dayTwo).getByRole('button', { name: 'Import this day' }));

        expect(api.post).toHaveBeenCalledWith('/calendar/events/import', { dayId: 2 });
    });

    test('both buttons are disabled while an import is running', async () => {
        api.post.mockReturnValue(new Promise(() => {}));
        renderPage();

        await userEvent.click(await screen.findByRole('button', { name: 'Import Google events' }));

        expect(screen.getByRole('button', { name: 'Import Google events' })).toBeDisabled();
        screen.getAllByRole('button', { name: 'Import this day' }).forEach((button) =>
            expect(button).toBeDisabled()
        );
    });

    test('header button is disabled when no day has a date, and the day button is absent', async () => {
        calendarAnswer = { days: [{ id: 1, position: 0, createdAt: '2026-09-16T08:00:00.000Z' }], items: [] };
        renderPage();

        expect(await screen.findByRole('button', { name: 'Import Google events' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Import this day' })).not.toBeInTheDocument();
    });

    test('shows a rejected import in the alert and Dismiss clears it, leaving days alone', async () => {
        api.post.mockRejectedValue(new Error('Google not connected'));
        renderPage();

        await userEvent.click(await screen.findByRole('button', { name: 'Import Google events' }));

        const alert = await screen.findByText('Google not connected');
        expect(alert.closest('[role="alert"]')).toBeVisible();
        expect(screen.getByRole('region', { name: 'Day 1' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Day 2' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));

        expect(screen.queryByText('Google not connected')).not.toBeInTheDocument();
    });
});
