import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';
import { dayLabel, todayKey } from '../../lib/dates';

jest.mock('../../lib/api');
jest.mock('../../hooks/useIsPhone', () => ({ __esModule: true, default: () => true }));

let calendarAnswer;

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    jest.clearAllMocks();
    calendarAnswer = { days: [{ id: 1, position: 0, createdAt: '2026-09-16T08:00:00.000Z' }], items: [] };
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
        if (path === '/calendar') {
            return calendarAnswer instanceof Error
                ? Promise.reject(calendarAnswer)
                : Promise.resolve(calendarAnswer);
        }
        return Promise.resolve([{ id: 2, title: 'Auth rewrite', datedSequences: [] }]);
    });
});

describe('CalendarPage on a phone', () => {
    test('renders the heading and the phone day view without desktop panels', async () => {
        const { container } = renderPage();

        expect(await screen.findByRole('region', { name: dayLabel(todayKey()) })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
        expect(container.querySelector('main')).toHaveClass('calendar-page--phone');
        expect(screen.queryByRole('link', { name: /all projects/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Projects' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Days' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /add day/i })).not.toBeInTheDocument();
    });

    test('shows loading without the project panel', () => {
        api.get.mockReturnValue(new Promise(() => {}));

        renderPage();

        expect(screen.getByLabelText('Loading calendar…')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Projects' })).not.toBeInTheDocument();
    });

    test('shows the load error and retry without the project panel', async () => {
        calendarAnswer = new Error('Could not reach the server.');

        renderPage();

        expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Projects' })).not.toBeInTheDocument();
    });
});
