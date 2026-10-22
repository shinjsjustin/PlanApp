import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import DayColumn from './DayColumn';
import { CalendarProvider } from '../../state/CalendarContext';
import { todayKey } from '../../lib/dates';

const day = { id: 4, position: 0, date: todayKey() };
const reminders = [{ id: 1, title: 'Call the dentist', startMinutes: 540, priority: 'normal' }];

const renderColumn = (props) =>
    render(
        <MemoryRouter>
            <CalendarProvider
                value={{
                    deleteDay: jest.fn(),
                    completeTodo: jest.fn(),
                    isUnsavedDay: () => false,
                    state: { days: [day], items: [] },
                }}
            >
                <DayColumn day={day} index={0} items={[]} onOpenSource={jest.fn()} {...props} />
            </CalendarProvider>
        </MemoryRouter>
    );

describe('DayColumn reminders', () => {
    test('draws each reminder as a link to the reminders page', () => {
        renderColumn({ reminders });

        expect(screen.getByRole('link', { name: 'Reminder: Call the dentist' })).toHaveAttribute(
            'href',
            '/reminders'
        );
    });

    test('draws none when given no reminders', () => {
        renderColumn({});

        expect(screen.queryByRole('link', { name: /^Reminder:/ })).not.toBeInTheDocument();
    });
});
