import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ReminderLayer from './ReminderLayer';
import { DayScaleProvider } from '../../state/DayScaleContext';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';

const geometry = createDayGeometry(PX_PER_SLOT_MIN);
const { minutesToPx } = geometry;

const block = (overrides = {}) => ({
    id: 1,
    title: 'Call the vet',
    startMinutes: 540,
    priority: 'normal',
    ...overrides,
});

const renderLayer = (reminders) =>
    render(
        <MemoryRouter>
            <DayScaleProvider value={geometry}>
                <ReminderLayer reminders={reminders} />
            </DayScaleProvider>
        </MemoryRouter>
    );

describe('ReminderLayer', () => {
    test('renders one labelled link to /reminders per block', () => {
        renderLayer([block(), block({ id: 2, title: 'Pay rent', startMinutes: 780 })]);

        expect(screen.getAllByRole('link')).toHaveLength(2);
        const link = screen.getByRole('link', { name: 'Reminder: Call the vet, 09:00' });
        expect(link).toHaveAttribute('href', '/reminders');
        expect(screen.getByRole('link', { name: 'Reminder: Pay rent, 13:00' })).toBeInTheDocument();
    });

    test('shows the title and time and sits at its start minute with a 30 minute height', () => {
        renderLayer([block()]);
        const link = screen.getByRole('link');

        expect(link).toHaveTextContent('Call the vet');
        expect(link).toHaveTextContent('09:00');
        expect(link.style.top).toBe(`${minutesToPx(540)}px`);
        expect(link.style.height).toBe(`${minutesToPx(30)}px`);
    });

    test('says high priority in text only for high blocks', () => {
        renderLayer([block({ priority: 'high' }), block({ id: 2, title: 'Other' })]);

        expect(screen.getAllByText(/high priority/i)).toHaveLength(1);
        expect(screen.getByRole('link', { name: 'Reminder: Call the vet, 09:00, High priority' })).toHaveTextContent(
            /high priority/i
        );
        expect(screen.getByRole('link', { name: 'Reminder: Other, 09:00' })).toBeInTheDocument();
    });

    test('has no drag, resize or edit controls', () => {
        const { container } = renderLayer([block()]);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(container.querySelector('.day-item-handle, .day-item-edge, [draggable="true"]')).toBeNull();
    });

    test('renders nothing for an empty list, without a router', () => {
        const { container } = render(
            <DayScaleProvider value={geometry}>
                <ReminderLayer reminders={[]} />
            </DayScaleProvider>
        );

        expect(container).toBeEmptyDOMElement();
    });
});
