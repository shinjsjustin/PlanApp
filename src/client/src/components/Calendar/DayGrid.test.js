import React from 'react';
import { render, screen } from '@testing-library/react';

import DayGrid from './DayGrid';
import { DAY_HEIGHT_PX, SLOTS_PER_DAY } from '../../lib/scheduleGeometry';

describe('DayGrid', () => {
    test('is exactly one day tall', () => {
        // Act
        const { container } = render(<DayGrid />);

        // Assert
        expect(container.querySelector('.day-grid')).toHaveStyle(`height: ${DAY_HEIGHT_PX}px`);
    });

    test('draws one line per half hour', () => {
        // Act
        const { container } = render(<DayGrid />);

        // Assert
        expect(container.querySelectorAll('.day-grid-slot')).toHaveLength(SLOTS_PER_DAY);
    });

    test('labels every hour from 00:00 to 23:00', () => {
        // Act
        const { container } = render(<DayGrid />);

        // Assert
        const labels = [...container.querySelectorAll('.day-grid-hour')].map(
            (node) => node.textContent
        );
        expect(labels).toHaveLength(24);
        expect(labels[0]).toBe('00:00');
        expect(labels[23]).toBe('23:00');
    });

    test('renders the bookings it is given over the grid', () => {
        // Act
        render(
            <DayGrid>
                <div>Wire up the token refresh</div>
            </DayGrid>
        );

        // Assert
        expect(screen.getByText('Wire up the token refresh')).toBeInTheDocument();
    });
});
