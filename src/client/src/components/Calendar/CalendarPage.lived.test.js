import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');
let mockIsPhone = false;
jest.mock('../../hooks/useIsPhone', () => ({ __esModule: true, default: () => mockIsPhone }));
jest.mock('./LivedView', () => ({ __esModule: true, default: () => <div data-testid="lived-view" /> }));

let calendarAnswer;

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockIsPhone = false;
    calendarAnswer = { days: [{ id: 1, position: 0, createdAt: '2026-09-16T08:00:00.000Z' }], items: [] };
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
        if (path === '/calendar') {
            return calendarAnswer instanceof Error
                ? Promise.reject(calendarAnswer)
                : Promise.resolve(calendarAnswer);
        }
        return Promise.resolve([]);
    });
});

afterEach(() => localStorage.clear());

const pressed = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('Calendar Lived | Plan switch', () => {
    test('desktops start on Plan', async () => {
        renderPage();

        expect(await screen.findByRole('region', { name: 'Days' })).toBeInTheDocument();
        expect(pressed('Plan')).toBe('true');
        expect(screen.queryByTestId('lived-view')).not.toBeInTheDocument();
    });

    test('phones start on Lived', () => {
        mockIsPhone = true;
        renderPage();

        expect(pressed('Lived')).toBe('true');
        expect(screen.getByTestId('lived-view')).toBeInTheDocument();
    });

    test('places the switch right after the heading', () => {
        renderPage();

        const heading = screen.getByRole('heading', { name: 'Calendar' });

        expect(heading.nextElementSibling).toContainElement(screen.getByRole('button', { name: 'Lived' }));
    });

    test('Lived replaces the plan view while the calendar is still loading', async () => {
        api.get.mockReturnValue(new Promise(() => {}));
        renderPage();

        await userEvent.click(screen.getByRole('button', { name: 'Lived' }));

        expect(screen.getByTestId('lived-view')).toBeInTheDocument();
        expect(screen.queryByLabelText('Loading calendar…')).not.toBeInTheDocument();
    });

    test('Lived replaces the load error', async () => {
        calendarAnswer = new Error('Could not reach the server.');
        renderPage();
        await screen.findByText('Could not reach the server.');

        await userEvent.click(screen.getByRole('button', { name: 'Lived' }));

        expect(screen.getByTestId('lived-view')).toBeInTheDocument();
        expect(screen.queryByText('Could not reach the server.')).not.toBeInTheDocument();
    });

    test('a choice survives a remount', async () => {
        const first = renderPage();
        await userEvent.click(screen.getByRole('button', { name: 'Lived' }));
        first.unmount();

        renderPage();

        expect(pressed('Lived')).toBe('true');
        expect(screen.getByTestId('lived-view')).toBeInTheDocument();
    });

    test('switching back to Plan restores the plan view', async () => {
        mockIsPhone = true;
        renderPage();

        await userEvent.click(screen.getByRole('button', { name: 'Plan' }));

        expect(screen.queryByTestId('lived-view')).not.toBeInTheDocument();
        expect(localStorage.getItem('calendarView')).toBe('plan');
    });
});
