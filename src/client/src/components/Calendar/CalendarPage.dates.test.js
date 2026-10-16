import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

let mockIsPhone = false;
jest.mock('../../hooks/useIsPhone', () => ({ __esModule: true, default: () => mockIsPhone }));

const PAST = '2000-01-01';
const FUTURE = '2999-01-01';

const day = (id, date) => ({
    id, position: id - 1, createdAt: '2026-09-16T08:00:00.000Z', ...(date ? { date } : {}),
});

let calendarAnswer;

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

const clearButton = () => screen.findByRole('button', { name: 'Clear past days' });

beforeEach(() => {
    jest.clearAllMocks();
    mockIsPhone = false;
    calendarAnswer = { days: [day(1, PAST), day(2, FUTURE)], items: [] };
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') return Promise.resolve({ notes: [] });
        if (path === '/calendar') return Promise.resolve(calendarAnswer);
        return Promise.resolve([]);
    });
    api.post.mockResolvedValue({ days: [day(2, FUTURE)], items: [] });
});

describe('Clear past days button', () => {
    test.each([['desktop', false], ['phone', true]])(
        'is a neon button on %s that posts clear-past when clicked',
        async (_, isPhone) => {
            mockIsPhone = isPhone;
            renderPage();

            if (isPhone) await userEvent.click(await screen.findByRole('button', { name: 'More' }));
            const button = await clearButton();
            expect(button).toHaveClass('neon-button');
            expect(button).toBeEnabled();
            await userEvent.click(button);

            expect(api.post).toHaveBeenCalledWith('/calendar/days/clear-past', {});
        }
    );

    test('is absent until the calendar is ready', () => {
        api.get.mockReturnValue(new Promise(() => {}));
        renderPage();

        expect(screen.queryByRole('button', { name: 'Clear past days' })).not.toBeInTheDocument();
    });

    test('is disabled when no day is dated before today', async () => {
        calendarAnswer = { days: [day(1, FUTURE), day(2)], items: [] };
        renderPage();

        expect(await clearButton()).toBeDisabled();
    });

    test('is disabled while a day is unsaved', async () => {
        let settle;
        api.post.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Add a day' }));

        expect(await clearButton()).toBeDisabled();

        settle({ days: [day(1, PAST), day(2, FUTURE), day(3, FUTURE)], items: [] });
    });
});
