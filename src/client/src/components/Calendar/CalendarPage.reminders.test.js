import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const days = [
    { id: 1, position: 0, date: '2026-10-15', createdAt: '2026-09-16T08:00:00.000Z' },
    { id: 2, position: 1, createdAt: '2026-09-16T08:00:00.000Z' },
];

let remindersAnswer;

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    jest.clearAllMocks();
    remindersAnswer = {
        reminders: [
            { id: 5, title: 'Call the dentist', dueDate: '2026-10-15', dueTime: '09:00', priority: 'normal' },
            { id: 6, title: 'Dateless', dueDate: null, dueTime: '10:00', priority: 'normal' },
        ],
    };
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
        if (path === '/calendar') return Promise.resolve({ days, items: [] });
        if (path === '/reminders?status=open') {
            return remindersAnswer instanceof Error
                ? Promise.reject(remindersAnswer)
                : Promise.resolve(remindersAnswer);
        }
        return Promise.resolve([]);
    });
});

describe('CalendarPage reminders', () => {
    test('draws a dated day its reminders and an undated day none', async () => {
        renderPage();

        const dayOne = await screen.findByRole('region', { name: 'Day 1' });
        const link = await within(dayOne).findByRole('link', { name: 'Reminder: Call the dentist, 09:00' });
        expect(link).toHaveAttribute('href', '/reminders');
        const dayTwo = screen.getByRole('region', { name: 'Day 2' });
        expect(within(dayTwo).queryByRole('link', { name: /^Reminder:/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole('link', { name: /^Reminder:/ })).toHaveLength(1);
    });

    test('keeps the calendar working when the reminders load fails', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        remindersAnswer = new Error('Boom');
        renderPage();

        expect(await screen.findByRole('region', { name: 'Day 1' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /^Reminder:/ })).not.toBeInTheDocument();
    });

    test('shows a retry notice when the reminders load fails and reloads on click', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        remindersAnswer = new Error('Boom');
        renderPage();

        const notice = await screen.findByText('Boom');
        expect(notice.closest('[role="status"]')).toHaveClass('calendar-events-notice');

        remindersAnswer = { reminders: [] };
        const callsBefore = api.get.mock.calls.filter(([p]) => p === '/reminders?status=open').length;
        await userEvent.click(screen.getByRole('button', { name: 'Retry reminders' }));

        await waitFor(() => expect(screen.queryByText('Boom')).not.toBeInTheDocument());
        expect(api.get.mock.calls.filter(([p]) => p === '/reminders?status=open')).toHaveLength(callsBefore + 1);
    });
});
