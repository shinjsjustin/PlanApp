import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { blocksForDate } from '../lib/dateEvents';

// One shared empty list, so an idle hook hands back the same array every render.
const EMPTY_EVENTS = [];

// Google events for one date, for the phone calendar stepping to a date that
// has no day record. The result is tagged with its date, so a response for a
// date already left is never shown and the previous date's events never linger.
const useDateEvents = (dateKey, shouldFetch) => {
    const [result, setResult] = useState({ dateKey: null, events: EMPTY_EVENTS, isUnavailable: false });

    useEffect(() => {
        if (!shouldFetch) return undefined;

        let isCurrent = true;
        const settle = (events, isUnavailable) => {
            if (isCurrent) setResult({ dateKey, events, isUnavailable });
        };

        api.get(`/bourne/calendar/events?from=${dateKey}&to=${dateKey}`)
            .then((body) => {
                const raw = Array.isArray(body?.events) ? body.events : EMPTY_EVENTS;
                settle(blocksForDate(raw, dateKey), false);
            })
            .catch((err) => {
                console.error('[date events] load failed', err);
                settle(EMPTY_EVENTS, true);
            });

        return () => {
            isCurrent = false;
        };
    }, [dateKey, shouldFetch]);

    if (!shouldFetch || result.dateKey !== dateKey) {
        return { events: EMPTY_EVENTS, isUnavailable: false };
    }

    return { events: result.events, isUnavailable: result.isUnavailable };
};

export default useDateEvents;
