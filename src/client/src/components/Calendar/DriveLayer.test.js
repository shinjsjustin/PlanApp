import React from 'react';
import { render, screen } from '@testing-library/react';

import DriveLayer from './DriveLayer';
import { DayScaleProvider } from '../../state/DayScaleContext';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import { clearDriveTimeCache } from '../../hooks/useDriveTimes';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { api } from '../../lib/api';
import { loadStylesheets } from '../../testUtils/stylesheet';

jest.mock('../../lib/api', () => ({ api: { get: jest.fn() } }));

const geometry = createDayGeometry(PX_PER_SLOT_MIN);
const { minutesToPx } = geometry;

const PLACES = [
    { id: 1, name: 'Home', address: '1 Home St' },
    { id: 2, name: 'Office', address: '2 Work Ave' },
];
const item = (overrides = {}) => ({ id: 7, placeId: 2, startMinutes: 600, durationMinutes: 60, ...overrides });
const OK = { status: 'ok', durationSeconds: 601, distanceMeters: 5000, mapsUrl: 'https://maps/x' };

const mockApi = (travel) =>
    api.get.mockImplementation((url) =>
        url === '/places'
            ? Promise.resolve({ places: PLACES, startPlaceId: 1 })
            : Promise.resolve(travel)
    );

const renderLayer = (props, { withProvider = true } = {}) => {
    const layer = (
        <DayScaleProvider value={geometry}>
            <DriveLayer date="2026-10-16" items={[item()]} events={[]} {...props} />
        </DayScaleProvider>
    );
    return render(withProvider ? <PlaceOptionsProvider>{layer}</PlaceOptionsProvider> : layer);
};

beforeEach(() => {
    jest.clearAllMocks();
    clearDriveTimeCache();
});

describe('DriveLayer', () => {
    test('renders nothing and calls no API without a provider', () => {
        const { container } = renderLayer({}, { withProvider: false });

        expect(container.querySelector('.calendar-drive')).toBeNull();
        expect(api.get).not.toHaveBeenCalled();
    });

    test('renders nothing and requests no drive while places are loading', () => {
        api.get.mockReturnValue(new Promise(() => {}));
        const { container } = renderLayer();

        expect(container.querySelector('.calendar-drive')).toBeNull();
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith('/places');
    });

    test('an ok leg ends at the stop start and is as tall as the drive rounded up', async () => {
        mockApi(OK);
        renderLayer();

        const block = await screen.findByLabelText('Drive to Office');
        expect(block).toHaveClass('calendar-drive');
        expect(block.style.top).toBe(`${minutesToPx(600 - 11)}px`);
        expect(block.style.height).toBe(`${minutesToPx(11)}px`);
        expect(block).toHaveTextContent('Drive 11 min');
        const link = screen.getByRole('link', { name: 'Maps' });
        expect(link).toHaveAttribute('href', 'https://maps/x');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    test('clamps the top at 0 when the drive starts before midnight', async () => {
        mockApi(OK);
        renderLayer({ items: [item({ startMinutes: 5 })] });

        const block = await screen.findByLabelText('Drive to Office');
        expect(block.style.top).toBe(`${minutesToPx(0)}px`);
        expect(block.style.height).toBe(`${minutesToPx(11)}px`);
    });

    test('an unavailable leg is a 15 minute block with no link when mapsUrl is null', async () => {
        mockApi({ status: 'unavailable', mapsUrl: null });
        renderLayer();

        const block = await screen.findByLabelText('Drive to Office');
        expect(block).toHaveTextContent('Drive time unavailable');
        expect(block.style.top).toBe(`${minutesToPx(585)}px`);
        expect(block.style.height).toBe(`${minutesToPx(15)}px`);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('an unavailable leg keeps the Maps link when mapsUrl is set', async () => {
        mockApi({ status: 'unavailable', mapsUrl: 'https://maps/y' });
        renderLayer();

        await screen.findByText('Drive time unavailable');
        expect(screen.getByRole('link', { name: 'Maps' })).toHaveAttribute('href', 'https://maps/y');
    });

    test('is positioned absolutely behind booking cards', async () => {
        const unload = loadStylesheets('Calendar.css');
        try {
            mockApi(OK);
            renderLayer();
            const block = await screen.findByLabelText('Drive to Office');
            const probe = document.createElement('div');
            probe.className = 'day-item-card';
            document.body.appendChild(probe);
            const cardZ = Number(getComputedStyle(probe).zIndex);
            probe.remove();

            expect(getComputedStyle(block).position).toBe('absolute');
            expect(Number(getComputedStyle(block).zIndex)).toBeLessThan(cardZ);
        } finally {
            unload();
        }
    });
});
