import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PhoneCalendarView from './PhoneCalendarView';
import useDateEvents from '../../hooks/useDateEvents';
import { todayKey } from '../../lib/dates';
import { CalendarProvider } from '../../state/CalendarContext';

jest.mock('../../hooks/useDateEvents');

const today = todayKey();
const block = { id: 1, title: 'Call the dentist', startMinutes: 540, priority: 'normal' };

beforeEach(() => {
    useDateEvents.mockReturnValue({ events: [], isUnavailable: false });
});

const renderView = (days, reminders) =>
    render(
        <MemoryRouter>
            <CalendarProvider
                value={{ completeTodo: jest.fn(), isUnsavedDay: () => false, state: { days, items: [] } }}
            >
                <PhoneCalendarView
                    notes={{ notesForDay: () => [] }}
                    onOpenSource={jest.fn()}
                    reminders={reminders}
                />
            </CalendarProvider>
        </MemoryRouter>
    );

describe('PhoneCalendarView reminders', () => {
    test('shows the selected date reminders on a date with a day record', () => {
        const remindersForDate = jest.fn((date) => (date === today ? [block] : []));
        renderView([{ id: 4, position: 0, date: today }], { remindersForDate });

        expect(screen.getByRole('link', { name: 'Reminder: Call the dentist' })).toHaveAttribute(
            'href',
            '/reminders'
        );
    });

    test('shows them on a date with no day record', () => {
        renderView([], { remindersForDate: () => [block] });

        expect(screen.getByRole('link', { name: 'Reminder: Call the dentist' })).toBeInTheDocument();
    });

    test('shows none when no reminders are given', () => {
        renderView([], null);

        expect(screen.queryByRole('link', { name: /^Reminder:/ })).not.toBeInTheDocument();
    });
});
