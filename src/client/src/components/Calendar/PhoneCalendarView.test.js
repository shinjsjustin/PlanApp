import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import PhoneCalendarView from './PhoneCalendarView';
import { dayLabel, nextDateKey, todayKey } from '../../lib/dates';
import { CalendarProvider } from '../../state/CalendarContext';

const days = [
    { id: 4, position: 0 },
    { id: 7, position: 1 },
    { id: 9, position: 2 },
];

const today = todayKey();
const tomorrow = nextDateKey(today);
const datedDays = [
    { id: 4, position: 0, date: '2026-01-01' },
    { id: 7, position: 1, date: today },
    { id: 9, position: 2, date: tomorrow },
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

    test('opens on the day dated today and shows its date and a Today badge', () => {
        renderView(datedDays);

        expect(screen.getByText(`${dayLabel(today)} · 2 of 3`)).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Day 2' })).toHaveAttribute('aria-current', 'date');
        expect(screen.getByText('Today')).toBeInTheDocument();
        expect(screen.getByText('second day booking')).toBeInTheDocument();
        expect(document.querySelector('time')).toHaveAttribute('datetime', today);
    });

    test('opens on the first day when none is dated today, with no badge', () => {
        renderView(datedDays.map((d, i) => ({ ...d, date: `2026-01-0${i + 1}` })));

        expect(screen.getByText(`${dayLabel('2026-01-01')} · 1 of 3`)).toBeInTheDocument();
        expect(screen.queryByText('Today')).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Day 1' })).not.toHaveAttribute('aria-current');
    });

    test('draws a now-line only when the shown day is today', () => {
        renderView(datedDays);
        expect(document.querySelectorAll('.phone-day .now-line')).toHaveLength(1);
    });

    test('draws no now-line on another or undated day', () => {
        renderView(datedDays.map((d, i) => ({ ...d, date: `2026-01-0${i + 1}` })));
        expect(document.querySelector('.now-line')).toBeNull();
    });

    test('draws no now-line on undated days', () => {
        renderView();
        expect(document.querySelector('.now-line')).toBeNull();
    });
});
