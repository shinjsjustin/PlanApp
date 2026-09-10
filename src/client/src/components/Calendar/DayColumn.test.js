import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DayColumn from './DayColumn';
import { CalendarProvider } from '../../state/CalendarContext';
import { INITIAL_SCROLL_MINUTES, minutesToPx } from '../../lib/scheduleGeometry';

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

const renderColumn = (items = [], calendar = {}) => {
    const value = {
        deleteDay: jest.fn(),
        completeTodo: jest.fn(),
        isUnsavedDay: () => false,
        state: { days: [day], items },
        ...calendar,
    };

    const rendered = render(
        <CalendarProvider value={value}>
            <DayColumn day={day} index={0} items={items} onOpenSource={jest.fn()} />
        </CalendarProvider>
    );

    return { ...rendered, value };
};

describe('DayColumn', () => {
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
