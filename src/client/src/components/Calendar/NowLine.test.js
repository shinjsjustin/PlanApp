import React from 'react';
import { render, act } from '@testing-library/react';

import NowLine from './NowLine';
import { DayScaleProvider } from '../../state/DayScaleContext';
import { createDayGeometry } from '../../lib/scheduleGeometry';

const geometry = createDayGeometry(2);

const renderLine = (date) =>
    render(
        <DayScaleProvider value={geometry}>
            <NowLine date={date} />
        </DayScaleProvider>
    );

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 15, 14, 47));
});
afterEach(() => jest.useRealTimers());

test('renders an aria-hidden now-line at the current slot on today', () => {
    const { container } = renderLine('2026-10-15');
    const line = container.querySelector('.now-line');

    expect(line).toHaveAttribute('data-minutes', '870');
    expect(line).toHaveAttribute('aria-hidden', 'true');
    expect(line.style.top).toBe(`${geometry.minutesToPx(870)}px`);
});

test('renders nothing on another date', () => {
    const { container } = renderLine('2026-10-16');
    expect(container.querySelector('.now-line')).toBeNull();
});

test('renders nothing without a date', () => {
    const { container } = renderLine(undefined);
    expect(container.querySelector('.now-line')).toBeNull();
});

test('moves to the next slot when time passes the boundary', () => {
    const { container } = renderLine('2026-10-15');

    act(() => { jest.advanceTimersByTime(13 * 60 * 1000); });

    const line = container.querySelector('.now-line');
    expect(line).toHaveAttribute('data-minutes', '900');
    expect(line.style.top).toBe(`${geometry.minutesToPx(900)}px`);
});
