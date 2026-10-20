import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import PhoneCalendarView from './PhoneCalendarView';
import useDateEvents from '../../hooks/useDateEvents';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import { clearDriveTimeCache } from '../../hooks/useDriveTimes';
import { CalendarProvider } from '../../state/CalendarContext';
import { api } from '../../lib/api';

jest.mock('../../lib/api', () => ({ api: { get: jest.fn() } }));
jest.mock('../../hooks/useDateEvents');

const PLACES = [
    { id: 1, name: 'Home', address: '1 Home St' },
    { id: 2, name: 'Office', address: '2 Work Ave' },
];
const OK = { status: 'ok', durationSeconds: 601, distanceMeters: 5000, mapsUrl: 'https://maps/x' };
const googleEvent = {
    id: 'g1',
    title: 'Standup',
    allDay: false,
    startMinutes: 600,
    durationMinutes: 30,
    location: '2 Work Ave, Town',
};

const renderView = () =>
    render(
        <PlaceOptionsProvider>
            <CalendarProvider value={{ completeTodo: jest.fn(), isUnsavedDay: () => false, state: { days: [], items: [] } }}>
                <PhoneCalendarView notes={{ notesForDay: () => [] }} onOpenSource={jest.fn()} />
            </CalendarProvider>
        </PlaceOptionsProvider>
    );

beforeEach(() => {
    jest.clearAllMocks();
    clearDriveTimeCache();
    useDateEvents.mockReturnValue({ events: [googleEvent], isUnavailable: false });
    api.get.mockImplementation((url) =>
        Promise.resolve(url === '/places' ? { places: PLACES, startPlaceId: 1 } : OK)
    );
});

describe('PhoneCalendarView drive blocks', () => {
    test('draws no drive block for a matched Google event', async () => {
        renderView();

        await screen.findByText('Standup');
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/places'));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(screen.queryByLabelText(/^Drive to/)).not.toBeInTheDocument();
    });
});
