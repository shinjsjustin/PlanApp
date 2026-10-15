import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import EventLayer from './EventLayer';
import { DayScaleProvider } from '../../state/DayScaleContext';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { loadStylesheets } from '../../testUtils/stylesheet';

const geometry = createDayGeometry(PX_PER_SLOT_MIN);
const { minutesToPx } = geometry;

const event = (overrides = {}) => ({
    id: 1,
    dayId: 4,
    googleEventId: 'g1',
    title: 'Dentist appointment',
    allDay: false,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const renderLayer = (events) =>
    render(
        <DayScaleProvider value={geometry}>
            <EventLayer events={events} />
        </DayScaleProvider>
    );

describe('EventLayer', () => {
    test('draws one calendar-event per timed event and skips all-day ones', () => {
        const { container } = renderLayer([
            event(),
            event({ id: 2, title: 'Lunch', startMinutes: 720 }),
            event({ id: 3, title: 'Holiday', allDay: true, startMinutes: 0, durationMinutes: 1440 }),
        ]);

        expect(container.querySelectorAll('.calendar-event')).toHaveLength(2);
        expect(screen.queryByText('Holiday')).not.toBeInTheDocument();
    });

    test('places each at its start minute and sizes it by its duration', () => {
        const { container } = renderLayer([event()]);
        const el = container.querySelector('.calendar-event');

        expect(el.style.top).toBe(`${minutesToPx(540)}px`);
        expect(el.style.height).toBe(`${minutesToPx(60)}px`);
    });

    test('clips the height so the end never passes midnight', () => {
        const { container } = renderLayer([event({ startMinutes: 1400, durationMinutes: 100 })]);

        expect(container.querySelector('.calendar-event').style.height).toBe(`${minutesToPx(40)}px`);
    });

    test('shows the title and the time range', () => {
        const { container } = renderLayer([event()]);
        const el = container.querySelector('.calendar-event');

        expect(el).toHaveTextContent('Dentist appointment');
        expect(el).toHaveTextContent('09:00–10:00');
    });

    test('is labelled as a Google event and has no controls', () => {
        const { container } = renderLayer([event()]);
        const el = container.querySelector('.calendar-event');

        expect(el).toHaveAttribute('aria-label', 'Google event: Dentist appointment');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(el.querySelector('.day-item-handle, .day-item-edge')).toBeNull();
    });

    describe('full-title tip', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('hover shows the full title in a tooltip', () => {
            const { container } = renderLayer([event()]);

            act(() => {
                fireEvent.mouseEnter(container.querySelector('.calendar-event'));
                jest.advanceTimersByTime(500);
            });

            expect(screen.getByRole('tooltip')).toHaveTextContent('Dentist appointment');
        });

        test('a tap toggles the tooltip', () => {
            const { container } = renderLayer([event()]);
            const el = container.querySelector('.calendar-event');

            fireEvent.click(el);
            expect(screen.getByRole('tooltip')).toHaveTextContent('Dentist appointment');
            fireEvent.click(el);
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        });
    });

    test('sits behind booking cards', () => {
        const unload = loadStylesheets('Calendar.css');
        try {
            const { container } = renderLayer([event()]);
            const eventZ = Number(getComputedStyle(container.querySelector('.calendar-event')).zIndex);
            const probe = document.createElement('div');
            probe.className = 'day-item-card';
            document.body.appendChild(probe);
            const cardZ = Number(getComputedStyle(probe).zIndex);
            probe.remove();

            expect(eventZ).toBeLessThan(cardZ);
            expect(getComputedStyle(container.querySelector('.calendar-event')).position).toBe('absolute');
        } finally {
            unload();
        }
    });
});
