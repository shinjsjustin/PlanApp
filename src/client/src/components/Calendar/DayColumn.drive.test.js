import React from 'react';
import { render, screen } from '@testing-library/react';

import DayColumn from './DayColumn';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import { clearDriveTimeCache } from '../../hooks/useDriveTimes';
import { CalendarProvider } from '../../state/CalendarContext';
import { api } from '../../lib/api';

jest.mock('../../lib/api', () => ({ api: { get: jest.fn() } }));

const PLACES = [
    { id: 1, name: 'Home', address: '1 Home St' },
    { id: 2, name: 'Office', address: '2 Work Ave' },
];
const day = { id: 4, position: 0, date: '2026-10-16' };
const booking = {
    todoId: 12,
    dayId: 4,
    startMinutes: 600,
    durationMinutes: 60,
    text: 'Plan the launch',
    status: 'incomplete',
    projectId: 2,
    sequenceId: 9,
    placeId: 2,
};
const OK = { status: 'ok', durationSeconds: 601, distanceMeters: 5000, mapsUrl: 'https://maps/x' };

const renderColumn = (items) =>
    render(
        <PlaceOptionsProvider>
            <CalendarProvider
                value={{ deleteDay: jest.fn(), completeTodo: jest.fn(), isUnsavedDay: () => false, state: { days: [day], items } }}
            >
                <DayColumn day={day} index={0} items={items} onOpenSource={jest.fn()} />
            </CalendarProvider>
        </PlaceOptionsProvider>
    );

beforeEach(() => {
    jest.clearAllMocks();
    clearDriveTimeCache();
    api.get.mockImplementation((url) =>
        Promise.resolve(url === '/places' ? { places: PLACES, startPlaceId: 1 } : OK)
    );
});

describe('DayColumn drive blocks', () => {
    test('draws a Drive to block for a booking with a place', async () => {
        renderColumn([booking]);

        expect(await screen.findByLabelText('Drive to Office')).toHaveTextContent('Drive 15 min');
    });

    test('draws no drive block for a booking without a place', async () => {
        renderColumn([{ ...booking, placeId: null }]);

        await screen.findByText('Plan the launch');
        expect(api.get).toHaveBeenCalledWith('/places');
        expect(screen.queryByLabelText(/^Drive to/)).not.toBeInTheDocument();
    });
});
