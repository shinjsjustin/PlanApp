import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// "Show me where this came from", arriving from the calendar as `?sequence=9`.
//
// Two delays, and each earns its place. The first is because the card is not on
// screen when the navigation happens — the graph has to load — so flashing
// immediately would flash nothing. The second is that a flash is a flash: it ends.
//
// The parameter is consumed the moment it is read, and the URL rewritten without
// it. Otherwise a reload, or a back-navigation onto this page, would flash a card
// the user never asked about a second time.

const HIGHLIGHT_DELAY_MS = 600;
const HIGHLIGHT_DURATION_MS = 2000;

const parseSequenceId = (raw) => {
    if (!raw) return null;

    const id = Number(raw);

    return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * The sequence to flash right now, or null. `isReady` is whether the graph has
 * loaded — the wait starts from that, not from mount.
 */
const useSequenceSpotlight = (isReady) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [pendingId, setPendingId] = useState(null);
    const [highlightedId, setHighlightedId] = useState(null);

    // Read once and clear. Held in state rather than read from the URL each
    // render, because clearing the URL would otherwise cancel the very timers
    // that are waiting to use it.
    useEffect(() => {
        const id = parseSequenceId(searchParams.get('sequence'));

        if (id === null) return;

        setPendingId(id);
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (pendingId === null || !isReady) return undefined;

        const show = setTimeout(() => setHighlightedId(pendingId), HIGHLIGHT_DELAY_MS);
        const hide = setTimeout(() => {
            setHighlightedId(null);
            setPendingId(null);
        }, HIGHLIGHT_DELAY_MS + HIGHLIGHT_DURATION_MS);

        return () => {
            clearTimeout(show);
            clearTimeout(hide);
        };
    }, [pendingId, isReady]);

    return highlightedId;
};

export default useSequenceSpotlight;
