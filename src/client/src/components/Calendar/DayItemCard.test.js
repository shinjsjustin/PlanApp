import React from 'react';
import { act, fireEvent, isInaccessible, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DayItemCard from './DayItemCard';
import { loadStylesheets } from '../../testUtils/stylesheet';
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
    test.each([
        ['incomplete', true, 'Pinned.'],
        ['blocked', true, 'Pinned. Blocked.'],
        ['complete', true, 'Pinned. Complete.'],
        ['blocked', false, 'Blocked.'],
        ['complete', false, 'Complete.'],
    ])('exposes status text for a %s booking with pin %s', (status, isPinned, expected) => {
        const { container } = renderCard({ status, isPinned });

        const statusText = screen.getByText(expected);
        expect(statusText).toHaveClass('calendar-sr-only');
        expect(isInaccessible(statusText)).toBe(false);
        expect(statusText).not.toHaveTextContent('Wire up the token refresh');
        expect(container.querySelector('.day-item-card')).not.toHaveAttribute('aria-label');
        expect(screen.getByRole('button', { name: 'Wire up the token refresh' })).toHaveTextContent('Wire up the token refresh');
        expect(screen.getAllByText('Wire up the token refresh')).toHaveLength(1);
        const pin = container.querySelector('.calendar-pin-icon');
        if (isPinned) expect(pin).toHaveAttribute('aria-hidden', 'true');
        else expect(pin).toBeNull();
    });

    test('does not announce a pin or special status for an unpinned incomplete booking', () => {
        const { container } = renderCard({ isPinned: false });
        expect(container.querySelector('.calendar-sr-only')).toBeNull();
    });

    test('a blocked pinned booking has the blocked modifier and a pin icon', () => {
        const { container } = renderCard({ status: 'blocked', isPinned: true });
        expect(container.querySelector('.day-item-card')).toHaveClass('day-item-card--blocked');
        expect(container.querySelector('.calendar-pin-icon')).toBeInTheDocument();
    });

    test('a complete pinned booking remains crossed out', () => {
        const unload = loadStylesheets('Calendar.css');
        try {
            const { container } = renderCard({ status: 'complete', isPinned: true });
            expect(getComputedStyle(container.querySelector('.day-item-name')).textDecoration).toBe('line-through');
            expect(container.querySelector('.calendar-pin-icon')).toBeInTheDocument();
        } finally {
            unload();
        }
    });

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
        // The click lands on the card body, so the tip repeats the text outside it.
        expect(document.querySelector('.day-item-name')).toHaveTextContent('Wire up the token refresh');
    });

    describe('full-text tip', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('hovering a to-do card shows its full text after the delay', () => {
            const { container } = renderCard();

            act(() => {
                fireEvent.mouseEnter(container.querySelector('.day-item-card'));
                jest.advanceTimersByTime(500);
            });

            expect(screen.getByRole('tooltip')).toHaveTextContent('Wire up the token refresh');
        });

        test('tapping the card body toggles the tip', () => {
            const { container } = renderCard();
            const card = container.querySelector('.day-item-card');

            fireEvent.click(card);
            expect(screen.getByRole('tooltip')).toBeInTheDocument();
            fireEvent.click(card);
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        });

        test('clicking the bubble, the name or an edge does not open it', () => {
            const resize = {
                top: { handleProps: {} },
                bottom: { handleProps: {} },
            };
            render(
                <DayItemCard item={item()} onComplete={jest.fn()} onOpenSource={jest.fn()} resize={resize} />
            );

            fireEvent.click(screen.getByRole('button', { name: /^Complete/ }));
            fireEvent.click(screen.getByRole('button', { name: 'Wire up the token refresh' }));
            screen.getAllByRole('separator').forEach((edge) => fireEvent.click(edge));

            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        });

        test('a sequence card with a preview shows the preview and no tip', () => {
            const sequence = { id: 9, title: 'Session handling', todos: [] };
            const { container } = render(
                <DayItemCard
                    item={item({ kind: 'sequence' })}
                    onComplete={jest.fn()}
                    sequence={sequence}
                />
            );
            const card = container.querySelector('.day-item-card');

            act(() => {
                fireEvent.mouseEnter(card);
                jest.advanceTimersByTime(500);
            });
            fireEvent.click(card);

            expect(container.querySelector('.panel-sequence-preview')).toBeInTheDocument();
            expect(document.querySelector('.full-text-tip')).not.toBeInTheDocument();
        });

        test('a sequence card without a preview gets the full-text tip', () => {
            const { container } = renderCard({ kind: 'sequence' });

            fireEvent.click(container.querySelector('.day-item-card'));

            expect(screen.getByRole('tooltip')).toHaveTextContent('Wire up the token refresh');
        });
    });
});
