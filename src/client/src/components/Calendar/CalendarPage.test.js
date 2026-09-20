import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';
import { loadStylesheets } from '../../testUtils/stylesheet';

jest.mock('../../lib/api');

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

/**
 * `api.get` answers by path. The page loads the calendar, the pool and the notes
 * independently, and each test wants to set them — or fail them — separately.
 */
let calendarAnswer = { days: [], items: [] };
let poolAnswer = [];
let notesAnswer = { notes: [] };
let notesError = null;

const answerWith = (answer) =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);

const routeGet = () => {
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') {
            return notesError ? Promise.reject(new Error(notesError)) : Promise.resolve(notesAnswer);
        }

        if (path === '/calendar') return answerWith(calendarAnswer);

        return answerWith(poolAnswer);
    });
};

const mockCalendar = (calendar) => {
    calendarAnswer = calendar;
};

const mockCalendarFailure = (message) => {
    calendarAnswer = new Error(message);
};

const mockPoolFailure = (message) => {
    poolAnswer = new Error(message);
};

const mockNotes = (notes) => {
    notesAnswer = { notes };
    notesError = null;
};

const mockNotesFailure = (message) => {
    notesError = message;
};

const pin = (overrides = {}) => ({
    id: 7, text: 'Wire up the token refresh', status: 'incomplete', isPinned: true,
    sequenceId: 9, sequenceTitle: 'Session handling', position: 0, ...overrides,
});

const pinnedProjects = (todos = [pin()]) => [{ id: 2, title: 'Auth rewrite', pinnedTodos: todos }];

/** One day, in the shape `GET /api/calendar` answers with. */
const day = (id) => ({ id, position: id - 1, createdAt: '2026-09-16T08:00:00.000Z' });

beforeEach(() => {
    jest.clearAllMocks();
    calendarAnswer = { days: [], items: [] };
    poolAnswer = [];
    notesAnswer = { notes: [] };
    notesError = null;
    routeGet();
});

describe('CalendarPage', () => {
    test('complete pins are inert while blocked unscheduled pins remain drag sources', async () => {
        poolAnswer = pinnedProjects([
            pin({ status: 'complete' }),
            pin({ id: 8, text: 'Blocked pin', status: 'blocked', sequenceId: null, sequenceTitle: null }),
        ]);
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: /Auth rewrite/ }));

        const complete = screen.getByText('Wire up the token refresh').closest('li');
        const blocked = screen.getByText('Blocked pin').closest('li');
        expect(complete).toHaveClass('panel-todo-row--complete');
        expect(complete.querySelector('[draggable="true"]')).toBeNull();
        expect(complete.querySelector('[role="button"]')).toBeNull();
        expect(blocked).toHaveClass('panel-todo-row--blocked');
        expect(blocked.querySelector('[draggable="true"]')).toBeInTheDocument();
        expect(blocked).toHaveTextContent('Unorganized');
        expect(blocked.querySelector('.calendar-pin-icon')).toBeInTheDocument();
    });

    test('a booking remains after unpinning and loses its icon on the next calendar read', async () => {
        const booking = {
            id: 40, todoId: 7, dayId: 1, text: 'Booked pin', status: 'blocked',
            isPinned: true, projectId: 2, projectTitle: 'Auth rewrite',
            sequenceId: 9, sequenceTitle: 'Session handling',
            startMinutes: 540, durationMinutes: 60,
        };
        mockCalendar({ days: [day(1)], items: [booking] });
        poolAnswer = pinnedProjects([pin({ text: 'Booked pin', status: 'blocked' })]);
        const first = renderPage();
        await screen.findByRole('region', { name: 'Days' });
        expect(first.container.querySelector('.day-item-card .calendar-pin-icon')).toBeInTheDocument();
        first.unmount();

        mockCalendar({ days: [day(1)], items: [{ ...booking, isPinned: false }] });
        poolAnswer = pinnedProjects([]);
        const second = renderPage();
        await screen.findByText('Booked pin');
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        const card = second.container.querySelector('.day-item-card');
        expect(card).toHaveClass('day-item-card--blocked');
        expect(card).toHaveTextContent('Booked pin');
        expect(card.querySelector('.calendar-pin-icon')).toBeNull();
        expect(screen.getByText('No pinned to-dos yet.')).toBeInTheDocument();
        expect(api.delete).not.toHaveBeenCalled();
    });

    test('keeps the action toast out of the page until there is something to say', async () => {
        // Arrange — the toast is permanently mounted and toggles `hidden`, so
        // the UA's `[hidden] { display: none }` is what has to win. It has the
        // same specificity as a bare class rule and loses to it, which left an
        // empty red alert box on screen for every load. Project.css already
        // carries the override this asserts; only a loaded cascade sees it.
        const unload = loadStylesheets('Calendar.css');

        try {
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
        mockCalendarFailure('Could not reach the server.');

        // Act
        renderPage();

        // Assert
        expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    test('retrying asks again', async () => {
        // Arrange — again, only the calendar fails, so one retry button exists
        mockCalendarFailure('Offline');
        renderPage();
        await screen.findByRole('button', { name: 'Try again' });
        mockCalendar({ days: [], items: [] });

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

        // Assert
        await waitFor(() => expect(screen.queryByText('Offline')).not.toBeInTheDocument());
    });

    test('renders the two panels once loaded', async () => {
        // Arrange
        // Act
        renderPage();

        // Assert
        expect(await screen.findByRole('region', { name: 'Days' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Projects' })).toBeInTheDocument();
    });

    test('a failed calendar leaves the pool listed but with no count to claim', async () => {
        // Arrange — the panels fail independently (design section 10), so a
        // calendar that will not load still leaves the pool on screen. What it
        // cannot leave behind is an answer: with no calendar, every booked to-do
        // would otherwise be counted as unscheduled and the pill would read a
        // number that is simply wrong.
        const projects = pinnedProjects();
        mockCalendarFailure('Could not reach the server.');
        poolAnswer = projects;

        // Act
        const { container } = renderPage();
        await screen.findByText('Could not reach the server.');
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        // Assert — the row is still listed, but nothing claims where it went.
        expect(screen.getByText('Wire up the token refresh')).toBeInTheDocument();
        expect(container.querySelector('.pool-card-count')).not.toBeInTheDocument();
        expect(container.querySelector('.panel-todo-badge')).not.toBeInTheDocument();

        // Act — and a retry that succeeds restores both, without a reload.
        mockCalendar({
            days: [{ id: 1, position: 0 }],
            items: [
                {
                    id: 40,
                    dayId: 1,
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
        });
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

        // Assert
        await waitFor(() =>
            expect(container.querySelector('.pool-card-count')).toHaveTextContent('0')
        );
        expect(container.querySelector('.panel-todo-badge')).toHaveTextContent('Day 1');
    });

    test('completing a booking refreshes the same pin as complete and keeps its Day badge', async () => {
        mockCalendar({
            days: [{ id: 1, position: 0 }],
            items: [
                {
                    id: 40,
                    dayId: 1,
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
        });
        poolAnswer = pinnedProjects();
        api.patch.mockResolvedValue({ id: 7, status: 'complete' });

        const { container } = renderPage();
        await screen.findByRole('region', { name: 'Days' });
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));
        expect(container.querySelector('.pool-card-count')).toHaveTextContent('0');

        mockCalendarFailure('The calendar is not asked again.');
        poolAnswer = pinnedProjects([pin({ status: 'complete' })]);

        // Act
        await userEvent.click(
            screen.getByRole('button', { name: 'Complete “Wire up the token refresh”' })
        );

        // Assert — the same row remains in the open panel and on its booked day.
        const row = container.querySelector('.panel-todo-row');
        await waitFor(() => expect(row).toHaveClass('panel-todo-row--complete'));
        expect(row).toHaveTextContent('Wire up the token refresh');
        expect(row).toHaveTextContent('Day 1');
        expect(row.querySelector('.calendar-pin-icon')).toBeInTheDocument();
        expect(container.querySelector('.day-item-card')).toHaveClass('day-item-card--complete');
        expect(container.querySelector('.pool-card-count')).toHaveTextContent('0');
    });

    test('a refill that fails says so and leaves the open pool alone', async () => {
        // Arrange — the read behind a tick is one nobody asked to wait for, so
        // losing it must not fold the panel away: the rows on screen are still
        // the last thing the server actually said.
        mockCalendar({
            days: [{ id: 1, position: 0 }],
            items: [
                {
                    id: 40,
                    dayId: 1,
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
        });
        poolAnswer = pinnedProjects();
        api.patch.mockResolvedValue({ id: 7, status: 'complete' });

        const { container } = renderPage();
        await screen.findByRole('region', { name: 'Days' });
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        mockCalendar({ days: [], items: [] });
        mockPoolFailure('Could not reach the server.');

        // Act
        await userEvent.click(
            screen.getByRole('button', { name: 'Complete “Wire up the token refresh”' })
        );

        // Assert — the panel says what went wrong above rows that are still
        // there, still expanded, and no retry screen has replaced them.
        const panel = within(screen.getByRole('region', { name: 'Projects' }));
        expect(await panel.findByText('Could not reach the server.')).toBeInTheDocument();
        expect(panel.getByText('Wire up the token refresh')).toBeInTheDocument();
        expect(panel.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
        expect(container.querySelector('.pool-card-count')).toHaveTextContent('0');
    });

    test('a booking whose day is not in the payload reads as unscheduled', async () => {
        // Arrange — the two reads behind GET /calendar are not snapshotted
        // against each other, so an item can name a day the payload does not
        // carry. The strip draws no such item; the pool must agree with it.
        mockCalendar({
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
        });
        poolAnswer = pinnedProjects();

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

describe('notes on the page', () => {
    test('draws the notes it loaded into their day', async () => {
        // Arrange
        mockCalendar({ days: [day(1)], items: [] });
        mockNotes([
            { id: 5, dayId: 1, text: 'on call', startMinutes: 540, durationMinutes: 60 },
        ]);

        // Act
        renderPage();

        // Assert
        expect(await screen.findByText('on call')).toBeInTheDocument();
    });

    test('reports a failed notes load without losing the calendar', async () => {
        // Arrange
        mockCalendar({ days: [day(1)], items: [] });
        mockNotesFailure('the server is down');

        // Act
        renderPage();

        // Assert — the day is still there, and the notice says what failed
        expect(await screen.findByRole('region', { name: 'Day 1' })).toBeInTheDocument();
        expect(screen.getByText(/the server is down/)).toBeInTheDocument();
    });

    test('shows a note write failure in the page toast', async () => {
        // Arrange
        mockCalendar({ days: [day(1)], items: [] });
        mockNotes([
            { id: 5, dayId: 1, text: 'on call', startMinutes: 540, durationMinutes: 60 },
        ]);
        api.delete.mockRejectedValue(new Error('could not delete that note'));

        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: /on call/ }));

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // Assert
        expect(await screen.findByText('could not delete that note')).toBeInTheDocument();
    });
});
