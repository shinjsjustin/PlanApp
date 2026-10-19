import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';
import { loadStylesheets } from '../../testUtils/stylesheet';
import { dayLabel, todayKey } from '../../lib/dates';

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

const TODAY = todayKey();
const LATER = '2099-01-02';

const planned = (overrides = {}) => ({
    id: 7, text: 'Wire up the token refresh', status: 'incomplete', position: 0, ...overrides,
});

const datedSequence = (overrides = {}) => ({
    id: 9, title: 'Session handling', date: TODAY, owner: 'justin', description: null,
    isBlocked: false, layerId: 1, visitMinutes: null, todos: [planned()], ...overrides,
});

const datedProjects = (sequences = [datedSequence()]) => [
    { id: 2, title: 'Auth rewrite', datedSequences: sequences },
];

const bookingOf = (overrides = {}) => ({
    id: 40, dayId: 1, todoId: 7, text: 'Wire up the token refresh', status: 'incomplete',
    projectId: 2, projectTitle: 'Auth rewrite', sequenceId: 9, sequenceTitle: 'Session handling',
    startMinutes: 540, durationMinutes: 60, ...overrides,
});


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

    test('styles the back link as a neon button', async () => {
        poolAnswer = datedProjects();
        renderPage();

        expect(await screen.findByRole('link', { name: /all projects/i })).toHaveClass('neon-button');
    });

    test("the panel lists Justin's dated sequences grouped by day, with their to-dos inside", async () => {
        poolAnswer = datedProjects([
            datedSequence({ id: 10, title: 'Later work', date: LATER, todos: [planned({ id: 8, text: 'Ship it' })] }),
            datedSequence(),
            datedSequence({ id: 11, title: 'Bourne work', owner: 'bourne', todos: [planned({ id: 9, text: 'Not mine' })] }),
        ]);
        renderPage();

        await screen.findByText('Session handling');
        const panel = within(screen.getByRole('region', { name: 'Projects' }));
        const headings = panel.getAllByRole('heading', { level: 3 });
        expect(headings.map((heading) => heading.textContent)).toEqual(['Today', dayLabel(LATER)]);
        const block = panel.getByText('Session handling').closest('.panel-sequence-row');
        expect(within(block).getByText('Wire up the token refresh')).toBeInTheDocument();
        expect(panel.getByText('Ship it')).toBeInTheDocument();
        expect(panel.queryByText('Bourne work')).not.toBeInTheDocument();
        expect(panel.queryByText('Not mine')).not.toBeInTheDocument();
    });

    test('a complete to-do in a block is inert while an incomplete one is a drag source', async () => {
        poolAnswer = datedProjects([
            datedSequence({
                todos: [planned({ status: 'complete' }), planned({ id: 8, text: 'Open step', position: 1 })],
            }),
        ]);
        renderPage();

        const complete = (await screen.findByText('Wire up the token refresh')).closest('li');
        const open = screen.getByText('Open step').closest('li');
        expect(complete).toHaveClass('panel-todo-row--complete');
        expect(complete.querySelector('[draggable="true"]')).toBeNull();
        expect(open.querySelector('[draggable="true"]')).toBeInTheDocument();
    });

    test('a booking shows no pin icon or Pinned text', async () => {
        mockCalendar({ days: [day(1)], items: [bookingOf({ status: 'blocked', isPinned: true })] });
        poolAnswer = datedProjects();
        const { container } = renderPage();
        await screen.findByRole('region', { name: 'Days' });

        const card = container.querySelector('.day-item-card');
        expect(card).toHaveClass('day-item-card--blocked');
        expect(card.querySelector('.calendar-pin-icon')).toBeNull();
        expect(card).not.toHaveTextContent('Pinned');
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

    test('a failed calendar leaves the pool listed but with no day to claim', async () => {
        // The panels fail independently (design section 10): with no calendar,
        // no to-do may claim to be booked.
        mockCalendarFailure('Could not reach the server.');
        poolAnswer = datedProjects();

        const { container } = renderPage();
        await screen.findByText('Could not reach the server.');

        expect(screen.getByText('Wire up the token refresh')).toBeInTheDocument();
        expect(container.querySelector('.panel-todo-badge')).not.toBeInTheDocument();

        mockCalendar({ days: [{ id: 1, position: 0 }], items: [bookingOf()] });
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

        await waitFor(() =>
            expect(container.querySelector('.panel-todo-badge')).toHaveTextContent('Day 1')
        );
    });

    test('completing a booking refreshes the same to-do as complete and keeps its Day badge', async () => {
        mockCalendar({ days: [{ id: 1, position: 0 }], items: [bookingOf()] });
        poolAnswer = datedProjects();
        api.patch.mockResolvedValue({ id: 7, status: 'complete' });

        const { container } = renderPage();
        await screen.findByRole('region', { name: 'Days' });

        mockCalendarFailure('The calendar is not asked again.');
        poolAnswer = datedProjects([datedSequence({ todos: [planned({ status: 'complete' })] })]);

        await userEvent.click(
            screen.getByRole('button', { name: 'Complete “Wire up the token refresh”' })
        );

        const row = container.querySelector('.panel-sequence-todos .panel-todo-row');
        await waitFor(() => expect(row).toHaveClass('panel-todo-row--complete'));
        expect(row).toHaveTextContent('Day 1');
        expect(container.querySelector('.day-item-card')).toHaveClass('day-item-card--complete');
    });

    test('a refill that fails says so and leaves the listed sequences alone', async () => {
        mockCalendar({ days: [{ id: 1, position: 0 }], items: [bookingOf()] });
        poolAnswer = datedProjects();
        api.patch.mockResolvedValue({ id: 7, status: 'complete' });

        renderPage();
        await screen.findByRole('region', { name: 'Days' });

        mockCalendar({ days: [], items: [] });
        mockPoolFailure('Could not reach the server.');

        await userEvent.click(
            screen.getByRole('button', { name: 'Complete “Wire up the token refresh”' })
        );

        const panel = within(screen.getByRole('region', { name: 'Projects' }));
        expect(await panel.findByText('Could not reach the server.')).toBeInTheDocument();
        expect(panel.getByText('Wire up the token refresh')).toBeInTheDocument();
        expect(panel.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    });

    test('a booking whose day is not in the payload reads as unscheduled', async () => {
        // The two reads behind GET /calendar are not snapshotted against each
        // other; the strip draws no such item and the panel must agree.
        mockCalendar({ days: [{ id: 1, position: 0 }], items: [bookingOf({ dayId: 99 })] });
        poolAnswer = datedProjects();

        const { container } = renderPage();
        await screen.findByText('Wire up the token refresh');

        expect(screen.queryByText('Day 0')).not.toBeInTheDocument();
        expect(container.querySelector('.panel-todo-row--scheduled')).not.toBeInTheDocument();
        expect(container.querySelector('.panel-todo-grip')).toBeInTheDocument();
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
