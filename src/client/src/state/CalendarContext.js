import React, { createContext, useContext } from 'react';

// The loaded calendar and its mutation helpers, shared with the strip and the
// pool. The value is whatever `useCalendar` returns, so a day column deep in the
// strip reads the same state and calls the same helpers as the page itself.

const CalendarContext = createContext(null);

export const CalendarProvider = ({ value, children }) => (
    <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
);

/**
 * Throws rather than handing back `null` outside a provider, matching
 * `useProjectContext`: a calendar component rendered on its own is a wiring
 * mistake, and reading `state` off undefined further down would report it far
 * from its cause.
 */
export const useCalendarContext = () => {
    const context = useContext(CalendarContext);

    if (!context) {
        throw new Error('useCalendarContext must be used inside a CalendarProvider');
    }

    return context;
};

export default CalendarContext;
