import React from 'react';
import { render, screen, within } from '@testing-library/react';

import AllDayEvents from './AllDayEvents';

const event = (overrides = {}) => ({
    id: 1,
    dayId: 4,
    googleEventId: 'g1',
    title: 'Holiday',
    allDay: true,
    startMinutes: 0,
    durationMinutes: 1440,
    ...overrides,
});

describe('AllDayEvents', () => {
    test('renders one chip per all-day event in a labelled list', () => {
        render(<AllDayEvents events={[event(), event({ id: 2, title: 'Conference' })]} />);

        const list = screen.getByRole('list', { name: 'All-day Google events' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(2);
        expect(within(list).getByText('Holiday')).toBeInTheDocument();
        expect(within(list).getByText('Conference')).toBeInTheDocument();
    });

    test('skips timed events', () => {
        render(<AllDayEvents events={[event(), event({ id: 2, title: 'Lunch', allDay: false })]} />);

        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        expect(screen.queryByText('Lunch')).not.toBeInTheDocument();
    });

    test('renders nothing when there are none', () => {
        const { container } = render(<AllDayEvents events={[event({ allDay: false })]} />);

        expect(container).toBeEmptyDOMElement();
    });
});
