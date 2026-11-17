import React, { createContext, useContext, useMemo } from 'react';

import { markersForDate } from '../lib/rhythmMarkers';

// The loaded Rhythm (the value `useRhythm` returns), shared with the calendar
// days. Unlike CalendarContext this is tolerant: a day column rendered without a
// provider, or while the rhythm is loading or failed, simply has no markers. The
// Rhythm page reports its own load errors.

const RhythmContext = createContext(null);

const NO_MARKERS = [];

export const RhythmProvider = ({ value, children }) => (
    <RhythmContext.Provider value={value}>{children}</RhythmContext.Provider>
);

/** The rhythm markers on `date` (YYYY-MM-DD); a stable empty array when there are none to show. */
export const useRhythmMarkers = (date) => {
    const rhythm = useContext(RhythmContext);
    const isReady = rhythm?.status === 'ready';

    return useMemo(() => {
        if (!isReady) return NO_MARKERS;

        return markersForDate(rhythm, date, Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, [isReady, rhythm, date]);
};

export default RhythmContext;
