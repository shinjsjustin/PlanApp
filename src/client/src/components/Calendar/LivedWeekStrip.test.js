import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import LivedWeekStrip from './LivedWeekStrip';

const DAYS = ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const moment = (id, startMinutes, durationMinutes, category) => ({ id, startMinutes, durationMinutes, category });

const renderStrip = (props = {}) =>
    render(<LivedWeekStrip days={DAYS} momentsByDate={{}} selected="2026-10-31" onSelect={() => {}} {...props} />);

beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 2, 12, 0));
});

afterEach(() => jest.useRealTimers());

describe('LivedWeekStrip', () => {
    it('renders seven day rows with only the selected one pressed', () => {
        renderStrip({ selected: '2026-11-01' });
        const rows = screen.getAllByRole('button');

        expect(rows).toHaveLength(7);
        expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(
            ['false', 'true', 'false', 'false', 'false', 'false', 'false']
        );
        expect(rows[0]).toHaveTextContent('Sat');
        expect(rows[6]).toHaveTextContent('Fri');
    });

    it('draws one coloured bar per moment at its share of 06:00-24:00', () => {
        const { container } = renderStrip({
            momentsByDate: { '2026-10-31': [moment(1, 360, 180, 'work'), moment(2, 900, 90, 'rest')] },
        });
        const bars = container.querySelectorAll('.lived-shape-row:first-child .lived-shape-bar i');

        expect(bars).toHaveLength(2);
        expect(bars[0].style.left).toBe('0%');
        expect(bars[0].style.width).toBe('16.666666666666664%');
        expect(bars[0].style.getPropertyValue('--c')).toBe('var(--lived-work)');
        expect(bars[1].style.getPropertyValue('--c')).toBe('var(--lived-rest)');
    });

    it('leaves future days empty even if moments exist', () => {
        const { container } = renderStrip({
            momentsByDate: { '2026-11-03': [moment(1, 480, 60, 'work')], '2026-11-02': [moment(2, 480, 60, 'work')] },
        });
        const rows = container.querySelectorAll('.lived-shape-row');

        expect(rows[2].querySelectorAll('i')).toHaveLength(1);
        expect(rows[3].querySelectorAll('i')).toHaveLength(0);
    });

    it('marks 06, 12, 18 and 24', () => {
        const { container } = renderStrip();
        const marks = [...container.querySelectorAll('.lived-shape-hours span')].map((s) => s.textContent);

        expect(marks).toEqual(['06', '12', '18', '24']);
    });

    it('calls onSelect with the tapped day key', () => {
        const onSelect = jest.fn();
        renderStrip({ onSelect });

        fireEvent.click(screen.getAllByRole('button')[3]);

        expect(onSelect).toHaveBeenCalledWith('2026-11-03');
    });
});
