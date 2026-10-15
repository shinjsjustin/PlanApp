import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';

// Loads the imported Google events and re-imports them. Read-only, so unlike
// `useCalendarNotes` there is no optimistic edit and no rollback: an import
// replaces the list with the server's answer, or leaves it alone and says why.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

// One shared empty list, so every day without events hands back the same array.
const EMPTY_EVENTS = [];

const messageOf = (err) => err?.message || GENERIC_FAILURE;

// The wire guarantees a parsed body and nothing about its shape; the protected
// page tests answer unknown GET paths with an array. Anything that is not an
// object holding an `events` array counts as no events.
const readEvents = (payload) =>
    Array.isArray(payload?.events) ? payload.events : EMPTY_EVENTS;

const useCalendarEvents = () => {
    const [events, setEvents] = useState(EMPTY_EVENTS);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState(null);
    const [loadError, setLoadError] = useState(null);

    const reload = useCallback(async () => {
        try {
            setEvents(readEvents(await api.get('/calendar/events')));
            setLoadError(null);
        } catch (err) {
            console.error('[calendar events] load failed', err);
            setLoadError(messageOf(err));
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const runImport = useCallback(async (body) => {
        setIsImporting(true);
        setError(null);

        try {
            setEvents(readEvents(await api.post('/calendar/events/import', body)));
        } catch (err) {
            console.error('[calendar events] import failed', err);
            setError(messageOf(err));
        } finally {
            setIsImporting(false);
        }
    }, []);

    const importAll = useCallback(() => runImport({}), [runImport]);
    const importDay = useCallback((dayId) => runImport({ dayId }), [runImport]);

    const dismissError = useCallback(() => setError(null), []);

    // Grouped once per change so a day's array keeps its identity while its
    // events do.
    const eventsByDay = useMemo(() => {
        const byDay = new Map();

        events.forEach((event) =>
            byDay.set(event.dayId, [...(byDay.get(event.dayId) ?? []), event])
        );

        return byDay;
    }, [events]);

    const eventsForDay = useCallback(
        (dayId) => eventsByDay.get(dayId) ?? EMPTY_EVENTS,
        [eventsByDay]
    );

    return useMemo(
        () => ({
            events,
            eventsForDay,
            importAll,
            importDay,
            isImporting,
            error,
            dismissError,
            loadError,
            reload,
        }),
        [events, eventsForDay, importAll, importDay, isImporting, error, dismissError, loadError, reload]
    );
};

export default useCalendarEvents;
