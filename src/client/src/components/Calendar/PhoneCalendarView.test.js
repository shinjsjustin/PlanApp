import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import PhoneCalendarView from './PhoneCalendarView';
import useDateEvents from '../../hooks/useDateEvents';
import { dayLabel, nextDateKey, previousDateKey, todayKey } from '../../lib/dates';
import { CalendarProvider } from '../../state/CalendarContext';

jest.mock('../../hooks/useDateEvents');

const today = todayKey();
const tomorrow = nextDateKey(today);
const yesterday = previousDateKey(today);

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

const items = [booking(12, 4, 'today booking'), booking(13, 7, 'tomorrow booking')];

const notes = {
    notesForDay: (dayId) =>
        dayId === 4 ? [{ id: 31, dayId: 4, text: 'today note', startMinutes: 540, durationMinutes: 60 }] : [],
};

const baseDays = [
    { id: 4, position: 0, date: today },
    { id: 7, position: 1, date: tomorrow },
    { id: 9, position: 2 },
];

const renderView = (days = baseDays, events) =>
    render(
        <CalendarProvider value={{ completeTodo: jest.fn(), isUnsavedDay: () => false, state: { days, items } }}>
            <PhoneCalendarView notes={notes} onOpenSource={jest.fn()} events={events} />
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

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
const previous = () => fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));

beforeEach(() => {
    useDateEvents.mockReset();
    useDateEvents.mockReturnValue({ events: [], isUnavailable: false });
});

describe('PhoneCalendarView', () => {
    test('opens on today with its label, Today badge, bookings and notes', () => {
        renderView();

        expect(screen.getAllByRole('region')).toHaveLength(1);
        expect(screen.getByRole('region', { name: dayLabel(today) })).toHaveAttribute('aria-current', 'date');
        expect(document.querySelector('time')).toHaveAttribute('datetime', today);
        expect(screen.getByText('Today')).toBeInTheDocument();
        expect(screen.getByText('today booking')).toBeInTheDocument();
        expect(screen.getByText('today note')).toBeInTheDocument();
        expect(screen.queryByText('tomorrow booking')).not.toBeInTheDocument();
    });

    test('the Next day button and a left swipe step one real date forward', () => {
        renderView();

        next();
        expect(screen.getByRole('region', { name: dayLabel(tomorrow) })).toBeInTheDocument();
        expect(screen.getByText('tomorrow booking')).toBeInTheDocument();
        expect(screen.queryByText('Today')).not.toBeInTheDocument();

        swipeLeft();
        expect(screen.getByRole('region', { name: dayLabel(nextDateKey(tomorrow)) })).toBeInTheDocument();
    });

    test('the Previous day button and a right swipe step back with no end stop', () => {
        renderView();

        previous();
        expect(screen.getByRole('region', { name: dayLabel(yesterday) })).toBeInTheDocument();

        swipeRight();
        expect(screen.getByRole('region', { name: dayLabel(previousDateKey(yesterday)) })).toBeInTheDocument();
    });

    test('vertical swipes change nothing', () => {
        renderView();
        swipeUp();
        expect(screen.getByRole('region', { name: dayLabel(today) })).toBeInTheDocument();
    });

    test('a date with no record says Nothing booked and fetches its events', () => {
        useDateEvents.mockReturnValue({
            events: [
                { id: 'e1', title: 'Dentist', allDay: false, startMinutes: 600, durationMinutes: 60 },
                { id: 'e2', title: 'Holiday', allDay: true, startMinutes: 0, durationMinutes: 1440 },
            ],
            isUnavailable: false,
        });
        renderView();
        previous();

        expect(screen.getByText('Nothing booked')).toBeInTheDocument();
        expect(screen.getByLabelText('Google event: Dentist')).toBeInTheDocument();
        expect(screen.getByText('Holiday')).toBeInTheDocument();
        expect(useDateEvents).toHaveBeenLastCalledWith(yesterday, true);
        expect(screen.queryByText('today booking')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Import this day' })).not.toBeInTheDocument();
    });

    test('a date with a record does not fetch', () => {
        renderView();
        expect(useDateEvents).toHaveBeenLastCalledWith(today, false);
        expect(screen.queryByText('Nothing booked')).not.toBeInTheDocument();
    });

    test('shows a muted line when Google events are unavailable', () => {
        useDateEvents.mockReturnValue({ events: [], isUnavailable: true });
        renderView();
        previous();

        expect(screen.getByText('Google events unavailable')).toBeInTheDocument();
    });

    test('an undated record is never shown', () => {
        renderView([{ id: 9, position: 0 }]);

        expect(screen.getByText('Nothing booked')).toBeInTheDocument();
        expect(useDateEvents).toHaveBeenLastCalledWith(today, true);
    });

    test('draws a now-line on today only', () => {
        renderView();
        expect(document.querySelectorAll('.phone-day .now-line')).toHaveLength(1);

        next();
        expect(document.querySelector('.now-line')).toBeNull();
    });

    test('renders no editing controls beyond the day arrows', () => {
        const { container } = renderView();

        expect(screen.queryByRole('button', { name: /add|delete|drag|note/i })).not.toBeInTheDocument();
        expect(container.querySelector('[draggable="true"]')).not.toBeInTheDocument();
    });

    describe('Google events on a day record', () => {
        const events = {
            eventsForDay: (dayId) =>
                dayId === 4
                    ? [
                          { id: 'e1', dayId: 4, title: 'Dentist', allDay: false, startMinutes: 600, durationMinutes: 60 },
                          { id: 'e2', dayId: 4, title: 'Holiday', allDay: true, startMinutes: 0, durationMinutes: 1440 },
                      ]
                    : [],
            importDay: jest.fn(),
            isImporting: false,
        };

        test('shows the record events and hides them on the next date', () => {
            renderView(baseDays, events);

            expect(screen.getByLabelText('Google event: Dentist')).toBeInTheDocument();
            expect(screen.getByText('Holiday')).toBeInTheDocument();

            swipeLeft();
            expect(screen.queryByLabelText('Google event: Dentist')).not.toBeInTheDocument();
        });

        test('import button posts the shown day and disables while importing', () => {
            const importDay = jest.fn();
            const { unmount } = renderView(baseDays, { ...events, importDay });

            fireEvent.click(screen.getByRole('button', { name: 'Import this day' }));
            expect(importDay).toHaveBeenCalledWith(4);
            unmount();

            renderView(baseDays, { ...events, isImporting: true });
            expect(screen.getByRole('button', { name: 'Import this day' })).toBeDisabled();
        });
    });
});
