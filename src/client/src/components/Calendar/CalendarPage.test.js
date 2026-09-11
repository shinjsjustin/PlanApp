import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';
import { loadStylesheets } from '../../testUtils/stylesheet';

jest.mock('../../lib/api');

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CalendarPage', () => {
    test('keeps the action toast out of the page until there is something to say', async () => {
        // Arrange — the toast is permanently mounted and toggles `hidden`, so
        // the UA's `[hidden] { display: none }` is what has to win. It has the
        // same specificity as a bare class rule and loses to it, which left an
        // empty red alert box on screen for every load. Project.css already
        // carries the override this asserts; only a loaded cascade sees it.
        const unload = loadStylesheets('Calendar.css');

        try {
            api.get.mockImplementation((path) =>
                path === '/calendar' ? Promise.resolve({ days: [], items: [] }) : Promise.resolve([])
            );

            // Act
            renderPage();
            await screen.findByRole('region', { name: 'Days' });

            // Assert — `hidden` alone would satisfy an is-it-in-the-DOM check,
            // so read what it actually resolves to.
            const toast = document.querySelector('.calendar-toast');
            expect(toast).toHaveAttribute('hidden');
            expect(getComputedStyle(toast).display).toBe('none');
        } finally {
            unload();
        }
    });

    test('shows a loading state before anything arrives', () => {
        // Arrange
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        renderPage();

        // Assert
        expect(screen.getByLabelText('Loading calendar…')).toBeInTheDocument();
    });

    test('offers a retry when the calendar fails to load', async () => {
        // Arrange — an empty strip and a failed load must not look alike.
        // Only the calendar fails: the pool renders its own alert and retry
        // button, so a blanket reject would match both panels here.
        api.get.mockImplementation((path) =>
            path === '/calendar'
                ? Promise.reject(new Error('Could not reach the server.'))
                : Promise.resolve([])
        );

        // Act
        renderPage();

        // Assert
        expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    test('retrying asks again', async () => {
        // Arrange — again, only the calendar fails, so one retry button exists
        api.get.mockImplementation((path) =>
            path === '/calendar' ? Promise.reject(new Error('Offline')) : Promise.resolve([])
        );
        renderPage();
        await screen.findByRole('button', { name: 'Try again' });
        api.get.mockImplementation((path) =>
            path === '/calendar' ? Promise.resolve({ days: [], items: [] }) : Promise.resolve([])
        );

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

        // Assert
        await waitFor(() => expect(screen.queryByText('Offline')).not.toBeInTheDocument());
    });

    test('renders the two panels once loaded', async () => {
        // Arrange
        api.get.mockImplementation((path) =>
            path === '/calendar' ? Promise.resolve({ days: [], items: [] }) : Promise.resolve([])
        );

        // Act
        renderPage();

        // Assert
        expect(await screen.findByRole('region', { name: 'Days' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Projects' })).toBeInTheDocument();
    });

    test('a booking whose day is not in the payload reads as unscheduled', async () => {
        // Arrange — the two reads behind GET /calendar are not snapshotted
        // against each other, so an item can name a day the payload does not
        // carry. The strip draws no such item; the pool must agree with it.
        api.get.mockImplementation((path) =>
            path === '/calendar'
                ? Promise.resolve({
                      days: [{ id: 1, position: 0 }],
                      items: [
                          {
                              id: 40,
                              dayId: 99,
                              todoId: 7,
                              text: 'Wire up the token refresh',
                              status: 'incomplete',
                              projectId: 2,
                              projectTitle: 'Auth rewrite',
                              sequenceId: 9,
                              sequenceTitle: 'Session handling',
                              startMinutes: 540,
                              durationMinutes: 60,
                          },
                      ],
                  })
                : Promise.resolve([
                      {
                          id: 2,
                          title: 'Auth rewrite',
                          frontier: [
                              {
                                  sequenceId: 9,
                                  sequenceTitle: 'Session handling',
                                  isStalled: false,
                                  nextTodo: { id: 7, text: 'Wire up the token refresh' },
                              },
                          ],
                      },
                  ])
        );

        // Act
        const { container } = renderPage();
        await userEvent.click(await screen.findByRole('button', { name: /Auth rewrite/ }));

        // Assert — no phantom "Day 0" badge, the row is still draggable work,
        // and the count of unscheduled to-dos is not one short.
        expect(screen.queryByText('Day 0')).not.toBeInTheDocument();
        expect(container.querySelector('.panel-todo-row--scheduled')).not.toBeInTheDocument();
        expect(container.querySelector('.pool-card-count')).toHaveTextContent('1');
    });
});
