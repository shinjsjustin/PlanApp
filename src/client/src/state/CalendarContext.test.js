import React from 'react';
import { render, screen } from '@testing-library/react';

import { CalendarProvider, useCalendarContext } from './CalendarContext';

const Consumer = () => {
    const { state } = useCalendarContext();

    return <p>{state.days.length} day(s)</p>;
};

describe('CalendarContext', () => {
    test('hands the schedule to everything inside the provider', () => {
        // Act
        render(
            <CalendarProvider value={{ state: { days: [{ id: 1 }, { id: 2 }], items: [] } }}>
                <Consumer />
            </CalendarProvider>
        );

        // Assert
        expect(screen.getByText('2 day(s)')).toBeInTheDocument();
    });

    test('fails loudly when used outside a provider rather than reading undefined', () => {
        // Arrange — React logs the thrown render error; silence it for this test.
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Act & Assert
        expect(() => render(<Consumer />)).toThrow(/CalendarProvider/);

        consoleError.mockRestore();
    });
});
