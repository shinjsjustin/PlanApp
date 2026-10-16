import React from 'react';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

let mockIsPhone = true;
jest.mock('../../hooks/useIsPhone', () => ({ __esModule: true, default: () => mockIsPhone }));

const MORE_CONTROLS = ['Clear past days', 'Import Google events', 'Export to Google'];

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });
const moreButton = () => screen.findByRole('button', { name: 'More' });
const queryConnect = () => screen.queryByText(/connect google/i);

beforeEach(() => {
    jest.clearAllMocks();
    mockIsPhone = true;
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
        if (path === '/calendar') {
            return Promise.resolve({
                days: [{ id: 1, position: 0, createdAt: '2026-09-16T08:00:00.000Z' }],
                items: [],
            });
        }
        return Promise.resolve([]);
    });
});

describe('CalendarPage header on a phone', () => {
    test('shows Calendar and a closed More with the other controls hidden', async () => {
        renderPage();

        const more = await moreButton();
        expect(more).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
        MORE_CONTROLS.forEach((name) => {
            expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        });
        expect(queryConnect()).not.toBeInTheDocument();
    });

    test('tapping More reveals the four controls and tapping again hides them', async () => {
        renderPage();
        const more = await moreButton();
        await waitForElementToBeRemoved(() => screen.queryByLabelText('Loading calendar…'));

        await userEvent.click(more);

        expect(more).toHaveAttribute('aria-expanded', 'true');
        MORE_CONTROLS.forEach((name) => {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        });
        expect(await screen.findByText(/connect google/i)).toBeInTheDocument();

        await userEvent.click(more);

        expect(more).toHaveAttribute('aria-expanded', 'false');
        MORE_CONTROLS.forEach((name) => {
            expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        });
        expect(queryConnect()).not.toBeInTheDocument();
    });

    test('More reaches Connect Google while the calendar is still loading', async () => {
        api.get.mockImplementation((path) => {
            if (path === '/calendar') return new Promise(() => {});
            if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
            return Promise.resolve([]);
        });
        renderPage();

        await userEvent.click(await moreButton());

        expect(await screen.findByText(/connect google/i)).toBeInTheDocument();
        MORE_CONTROLS.forEach((name) => {
            expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        });
    });

    test('More reaches Connect Google after the calendar fails to load', async () => {
        api.get.mockImplementation((path) => {
            if (path === '/calendar') return Promise.reject(new Error('Could not reach the server.'));
            if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
            return Promise.resolve([]);
        });
        renderPage();
        await screen.findByText('Could not reach the server.');

        await userEvent.click(await moreButton());

        expect(await screen.findByText(/connect google/i)).toBeInTheDocument();
        MORE_CONTROLS.forEach((name) => {
            expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        });
    });

    test('desktop has no More button and shows the controls directly', async () => {
        mockIsPhone = false;
        renderPage();

        expect(await screen.findByRole('button', { name: 'Clear past days' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    });
});
