import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DayStrip from './DayStrip';
import { CalendarProvider } from '../../state/CalendarContext';

const dayAt = (id) => ({ id, position: id, createdAt: '2026-09-09T08:30:00.000Z' });

const bookingIn = (dayId, text) => ({
    todoId: dayId * 10,
    dayId,
    startMinutes: 540,
    durationMinutes: 60,
    text,
    status: 'incomplete',
    projectId: 2,
    sequenceId: 9,
});

const renderStrip = (calendar = {}) => {
    const value = {
        addDay: jest.fn(),
        deleteDay: jest.fn(),
        completeTodo: jest.fn(),
        isUnsavedDay: () => false,
        hasUnsavedDay: false,
        state: { days: [], items: [] },
        ...calendar,
    };

    const rendered = render(
        <CalendarProvider value={value}>
            <DayStrip onOpenSource={jest.fn()} />
        </CalendarProvider>
    );

    return { ...rendered, value };
};

describe('DayStrip', () => {
    test('renders its days left to right, in the order the state holds them', () => {
        // Arrange + Act
        renderStrip({ state: { days: [dayAt(4), dayAt(7)], items: [] } });

        // Assert
        const columns = screen.getAllByRole('region', { name: /^Day \d+$/ });
        expect(columns.map((column) => column.getAttribute('aria-label'))).toEqual([
            'Day 1',
            'Day 2',
        ]);
    });

    test('gives each column only the bookings filed under it', () => {
        // Arrange + Act
        renderStrip({
            state: {
                days: [dayAt(4), dayAt(7)],
                items: [bookingIn(4, 'Rotate the keys'), bookingIn(7, 'Draft the migration')],
            },
        });

        // Assert
        const [first, second] = screen.getAllByRole('region', { name: /^Day \d+$/ });
        expect(first).toHaveTextContent('Rotate the keys');
        expect(first).not.toHaveTextContent('Draft the migration');
        expect(second).toHaveTextContent('Draft the migration');
    });

    test('the + adds a day', async () => {
        // Arrange
        const { value } = renderStrip({ state: { days: [dayAt(4)], items: [] } });

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Add a day' }));

        // Assert
        expect(value.addDay).toHaveBeenCalled();
    });

    test('the + is disabled while a day is still waiting for its id, and says why', async () => {
        // Arrange — clicking + twice before the first POST lands would ask the
        // server for a second day the strip could not tell apart from the first.
        const { value } = renderStrip({
            state: { days: [dayAt(-1)], items: [] },
            isUnsavedDay: (dayId) => dayId < 0,
            hasUnsavedDay: true,
        });

        // Act
        const add = screen.getByRole('button', { name: 'Add a day' });
        await userEvent.click(add);

        // Assert
        expect(add).toBeDisabled();
        expect(add).toHaveAttribute('title', expect.stringMatching(/saving/i));
        expect(value.addDay).not.toHaveBeenCalled();
    });

    test('an empty calendar invites a first day rather than showing a bare strip', async () => {
        // Arrange
        const { value } = renderStrip();

        // Assert — the invitation, not just the +
        expect(screen.getByText(/No days yet/)).toBeInTheDocument();

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Add the first day' }));

        // Assert
        expect(value.addDay).toHaveBeenCalled();
    });
});
