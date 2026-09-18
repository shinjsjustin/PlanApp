import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DayColumn from './DayColumn';
import { assignLanes } from '../../lib/noteLanes';
import { CalendarProvider } from '../../state/CalendarContext';
import { INITIAL_SCROLL_MINUTES, PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { loadStylesheets, containingBlockOf } from '../../testUtils/stylesheet';

/**
 * The real lane picker, counted.
 *
 * Wrapping rather than stubbing: every other test in this file renders real
 * ribbons in real lanes, and a stub would quietly take that away. All this adds
 * is a call count, which is the only way from out here to see whether the memo
 * inside `NotePlane` is holding.
 */
jest.mock('../../lib/noteLanes', () => {
    const actual = jest.requireActual('../../lib/noteLanes');

    return { ...actual, assignLanes: jest.fn(actual.assignLanes) };
});

/**
 * The implementation has to be put back before every test, not just the count
 * cleared: CRA's Jest config sets `resetMocks`, which strips a `jest.fn`'s
 * implementation between tests. Left alone, the wrapper above would return
 * `undefined` from the second test onwards and every ribbon in this file would
 * fail on a lane map that was not there.
 */
const { assignLanes: realAssignLanes } = jest.requireActual('../../lib/noteLanes');

const { minutesToPx } = createDayGeometry(PX_PER_SLOT_MIN);

const day = { id: 4, position: 0, createdAt: '2026-09-09T08:30:00.000Z' };

const booking = {
    todoId: 12,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    text: 'Wire up the token refresh',
    status: 'incomplete',
    projectId: 2,
    sequenceId: 9,
};

const renderColumn = (items = [], calendar = {}, props = {}) => {
    const value = {
        deleteDay: jest.fn(),
        completeTodo: jest.fn(),
        isUnsavedDay: () => false,
        state: { days: [day], items },
        ...calendar,
    };

    const rendered = render(
        <CalendarProvider value={value}>
            <DayColumn day={day} index={0} items={items} onOpenSource={jest.fn()} {...props} />
        </CalendarProvider>
    );

    return { ...rendered, value };
};

/**
 * A note on this column's day.
 *
 * Its id is deliberately nothing like the day's — the column addresses both, and
 * a fixture that numbered them alike would let it confuse the two and still pass.
 */
const noteOnThisDay = (id, overrides = {}) => ({
    id,
    dayId: day.id,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

describe('DayColumn', () => {
    beforeEach(() => {
        assignLanes.mockImplementation(realAssignLanes);
    });

    test('pins its delete bubble to the column rather than the page', () => {
        // Arrange — DeleteBubble.css absolutely positions the x and states the
        // host contract it relies on: the host carries `has-delete-bubble` AND
        // is a positioning context. Without the latter the x escapes to the
        // nearest one that is — the page — where all three columns stack their
        // x in the same corner, outside the column that owns it. Only a real
        // cascade shows that, so both sheets are loaded.
        const unload = loadStylesheets('Calendar.css', 'DeleteBubble.css');

        try {
            renderColumn();

            // Act
            const bubble = screen.getByRole('button', { name: 'Delete Day 1' });

            // Assert
            expect(getComputedStyle(bubble).position).toBe('absolute');
            expect(containingBlockOf(bubble)).toBe(screen.getByRole('region', { name: 'Day 1' }));
        } finally {
            unload();
        }
    });

    test('names itself by its place in the strip and stamps when it was made', () => {
        renderColumn();

        expect(screen.getByRole('region', { name: 'Day 1' })).toBeInTheDocument();
        expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    test('opens scrolled to 06:00', () => {
        // Arrange — jsdom has no layout, so an element never grows a scrolling
        // box and reading `scrollTop` back always answers 0 however it was set.
        // Spy on the assignment instead: what is under test is that the column
        // scrolls itself to 06:00 on mount, not that jsdom models scrolling.
        //
        // `Element.prototype`, not `HTMLElement.prototype`: jsdom defines
        // `scrollTop` on the former, so asking the latter for an own descriptor
        // answers `undefined` and the restore below throws instead of putting
        // the real accessor back.
        const scrolled = [];
        const descriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, 'scrollTop');
        Object.defineProperty(window.Element.prototype, 'scrollTop', {
            configurable: true,
            get: () => 0,
            set(value) {
                scrolled.push(value);
            },
        });

        try {
            // Act
            renderColumn();

            // Assert
            expect(scrolled).toContain(minutesToPx(INITIAL_SCROLL_MINUTES));
        } finally {
            Object.defineProperty(window.Element.prototype, 'scrollTop', descriptor);
        }
    });

    test('renders its bookings', () => {
        renderColumn([booking]);

        expect(screen.getByText('Wire up the token refresh')).toBeInTheDocument();
    });

    test('deletes an empty day without asking', async () => {
        // Arrange
        const { value } = renderColumn([]);

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete Day 1' }));

        // Assert
        expect(value.deleteDay).toHaveBeenCalledWith(4);
    });

    test('asks before deleting a day that holds work, and says how much', async () => {
        // Arrange
        const { value } = renderColumn([booking]);

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete Day 1' }));

        // Assert
        expect(screen.getByText(/1 booking/)).toBeInTheDocument();
        expect(value.deleteDay).not.toHaveBeenCalled();
    });

    test('offers no delete on a day the server has not stored yet', () => {
        // Arrange + Act
        renderColumn([], { isUnsavedDay: () => true });

        // Assert
        expect(screen.queryByRole('button', { name: 'Delete Day 1' })).not.toBeInTheDocument();
    });

    test('gives its day a notes plane, named for the column it is in', () => {
        // Act
        const { container } = renderColumn();

        // Assert — the label distinguishes one column's plane from the next's,
        // which is the only thing that does when three days are on screen.
        const plane = screen.getByRole('group', { name: 'Notes for Day 1' });
        expect(plane).toBe(container.querySelector('.note-plane'));
        expect(plane).toHaveAttribute('data-day-id', String(day.id));
    });

    test('draws the notes it is given', () => {
        // Act
        renderColumn([], {}, { notes: [noteOnThisDay(31)] });

        // Assert
        expect(screen.getByText('note 31')).toBeInTheDocument();
    });

    test('lets a caller supply the wired plane in place of the plain one', () => {
        // Arrange — the gestures live in the wrapper that has the DndContext,
        // so it hands the column a plane rather than props for one.
        const notePlane = <div data-testid="wired-plane" />;

        // Act
        const { container } = renderColumn([], {}, { notePlane });

        // Assert
        expect(screen.getByTestId('wired-plane')).toBeInTheDocument();
        expect(container.querySelector('.note-plane')).not.toBeInTheDocument();
    });

    test('hands an empty day the same notes twice, so its lanes are worked out once', () => {
        // Arrange — `NotePlane` memoises its lane assignment on the identity of
        // the notes array, and `useCalendarNotes` goes to the trouble of
        // returning one stable array per day to make that memo hold. A default
        // parameter here would undo it for every column with no notes: `[]`
        // evaluates afresh on each render, so the memo would miss every time.
        const { rerender } = renderColumn();
        expect(assignLanes).toHaveBeenCalledTimes(1);

        // Act — render again with nothing changed
        rerender(
            <CalendarProvider
                value={{
                    deleteDay: jest.fn(),
                    completeTodo: jest.fn(),
                    isUnsavedDay: () => false,
                    state: { days: [day], items: [] },
                }}
            >
                <DayColumn day={day} index={0} items={[]} onOpenSource={jest.fn()} />
            </CalendarProvider>
        );

        // Assert
        expect(assignLanes).toHaveBeenCalledTimes(1);
    });

    test('hangs both planes off one clock face', () => {
        // Arrange — the two planes are positioned from the same minutes, which
        // only holds while they are laid over the same box. Drawn against
        // different ancestors they would drift apart by whatever separates them,
        // and no amount of arithmetic would line them up again. Only a real
        // cascade shows which box each is measured in.
        const unload = loadStylesheets('Calendar.css');

        try {
            // Act
            const { container } = renderColumn([booking], {}, { notes: [noteOnThisDay(31)] });

            // Assert
            const grid = container.querySelector('.day-grid');
            expect(containingBlockOf(container.querySelector('.note-plane'))).toBe(grid);
            expect(containingBlockOf(container.querySelector('.day-item-card'))).toBe(grid);
        } finally {
            unload();
        }
    });

    test('confirming the prompt deletes it', async () => {
        // Arrange
        const { value } = renderColumn([booking]);
        await userEvent.click(screen.getByRole('button', { name: 'Delete Day 1' }));

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Delete day/ }));

        // Assert
        expect(value.deleteDay).toHaveBeenCalledWith(4);
    });
});
