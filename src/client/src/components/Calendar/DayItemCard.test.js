import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DayItemCard from './DayItemCard';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';

const { minutesToPx } = createDayGeometry(PX_PER_SLOT_MIN);

const item = (overrides = {}) => ({
    todoId: 12,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    text: 'Wire up the token refresh',
    status: 'incomplete',
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 9,
    sequenceTitle: 'Session handling',
    ...overrides,
});

const renderCard = (overrides = {}, handlers = {}) =>
    render(
        <DayItemCard
            item={item(overrides)}
            onComplete={handlers.onComplete ?? jest.fn()}
            onOpenSource={handlers.onOpenSource ?? jest.fn()}
        />
    );

describe('DayItemCard', () => {
    test('sits at its start time and is as tall as its duration', () => {
        // Act
        const { container } = renderCard();

        // Assert
        const card = container.querySelector('.day-item-card');
        expect(card).toHaveStyle(`top: ${minutesToPx(540)}px`);
        expect(card).toHaveStyle(`height: ${minutesToPx(60)}px`);
    });

    test('shows the span it occupies', () => {
        renderCard();

        expect(screen.getByText('09:00–10:00')).toBeInTheDocument();
    });

    test('reads the end of a day as 24:00', () => {
        renderCard({ startMinutes: 1380, durationMinutes: 60 });

        expect(screen.getByText('23:00–24:00')).toBeInTheDocument();
    });

    test('the bubble completes the to-do', async () => {
        // Arrange
        const onComplete = jest.fn();
        renderCard({}, { onComplete });

        // Act
        await userEvent.click(
            screen.getByRole('button', { name: 'Complete “Wire up the token refresh”' })
        );

        // Assert
        expect(onComplete).toHaveBeenCalledWith(12);
    });

    test('a completed item stays put, struck through, with an inert bubble', () => {
        // Arrange + Act
        const { container } = renderCard({ status: 'complete' });

        // Assert
        expect(container.querySelector('.day-item-card--complete')).toBeInTheDocument();
        expect(container.querySelector('.day-item-card')).toHaveStyle(
            `top: ${minutesToPx(540)}px`
        );
        expect(screen.getByRole('button', { name: /Completed/ })).toBeDisabled();
    });

    test('the name opens the sequence it came from', async () => {
        // Arrange
        const onOpenSource = jest.fn();
        renderCard({}, { onOpenSource });

        // Act — an exact string, not a regex: the bubble's accessible name is
        // `Complete “Wire up the token refresh”` and a substring match would
        // find both buttons.
        await userEvent.click(screen.getByRole('button', { name: 'Wire up the token refresh' }));

        // Assert
        expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ todoId: 12 }));
    });

    test('the name is plain text while nothing can open the source', async () => {
        // Arrange — no `onOpenSource`: opening the source is Task 28's, so the
        // production page passes none today.
        render(<DayItemCard item={item()} onComplete={jest.fn()} />);

        // Act — clicking the name must do nothing rather than throw.
        await userEvent.click(screen.getByText('Wire up the token refresh'));

        // Assert
        expect(
            screen.queryByRole('button', { name: 'Wire up the token refresh' })
        ).not.toBeInTheDocument();
        expect(screen.getByText('Wire up the token refresh')).toBeInTheDocument();
    });
});
