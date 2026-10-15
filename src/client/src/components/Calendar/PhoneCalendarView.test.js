import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import PhoneCalendarView from './PhoneCalendarView';
import { CalendarProvider } from '../../state/CalendarContext';

const days = [
    { id: 4, position: 0, createdAt: '2026-09-09T08:30:00.000Z' },
    { id: 7, position: 1, createdAt: '2026-09-10T08:30:00.000Z' },
    { id: 9, position: 2, createdAt: '2026-09-11T08:30:00.000Z' },
];

const booking = (todoId, dayId, text) => ({
    todoId,
    dayId,
    startMinutes: 540,
    durationMinutes: 60,
    text,
    status: 'incomplete',
    projectId: 2,
    sequenceId: 9,
});

const items = [booking(12, 4, 'first day booking'), booking(13, 7, 'second day booking')];

const notes = {
    notesForDay: (dayId) =>
        dayId === 4 ? [{ id: 31, dayId: 4, text: 'first day note', startMinutes: 540, durationMinutes: 60 }] : [],
};

const renderView = (dayList = days) =>
    render(
        <CalendarProvider
            value={{ completeTodo: jest.fn(), isUnsavedDay: () => false, state: { days: dayList, items } }}
        >
            <PhoneCalendarView notes={notes} onOpenSource={jest.fn()} />
        </CalendarProvider>
    );

const swipe = (from, to) => {
    const target = document.querySelector('.phone-day-scroll');
    fireEvent.touchStart(target, { touches: [{ clientX: from[0], clientY: from[1] }] });
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
};
const swipeLeft = () => swipe([300, 200], [100, 200]);
const swipeRight = () => swipe([100, 200], [300, 200]);
const swipeUp = () => swipe([200, 400], [200, 100]);

describe('PhoneCalendarView', () => {
    test('shows only Day 1 first, with its bookings and notes', () => {
        renderView();

        expect(screen.getAllByRole('region')).toHaveLength(1);
        expect(screen.getByRole('region', { name: 'Day 1' })).toBeInTheDocument();
        expect(screen.getByText('Day 1 of 3')).toBeInTheDocument();
        expect(screen.getByText('first day booking')).toBeInTheDocument();
        expect(screen.getByText('first day note')).toBeInTheDocument();
        expect(screen.queryByText('second day booking')).not.toBeInTheDocument();
    });

    test('swiping left shows the next day and stops at the last', () => {
        renderView();

        swipeLeft();
        expect(screen.getByRole('region', { name: 'Day 2' })).toBeInTheDocument();
        expect(screen.getByText('second day booking')).toBeInTheDocument();

        swipeLeft();
        swipeLeft();
        expect(screen.getByText('Day 3 of 3')).toBeInTheDocument();
    });

    test('swiping right shows the previous day and stops at the first', () => {
        renderView();
        swipeRight();
        expect(screen.getByText('Day 1 of 3')).toBeInTheDocument();

        swipeLeft();
        swipeRight();
        expect(screen.getByText('Day 1 of 3')).toBeInTheDocument();
    });

    test('vertical swipes change nothing', () => {
        renderView();
        swipeUp();
        expect(screen.getByText('Day 1 of 3')).toBeInTheDocument();
    });

    test('renders no editing controls', () => {
        const { container } = renderView();

        expect(screen.queryByRole('button', { name: /add|delete|drag|note/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(container.querySelector('[draggable="true"]')).not.toBeInTheDocument();
        expect(container.querySelector('.resize-handle, [class*="resize"]')).not.toBeInTheDocument();
    });

    test('says so when there are no days', () => {
        renderView([]);
        expect(screen.getByText('No days yet')).toBeInTheDocument();
    });
});
