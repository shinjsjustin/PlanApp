import { useCallback, useMemo, useState } from 'react';

import { api } from '../lib/api';

// Pushes the booked work to Google and reports the counts. Like an import it
// changes nothing locally: it either holds the server's tally or says why not.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (err) => err?.message || GENERIC_FAILURE;

// The wire guarantees a parsed body and nothing about its shape.
const countOf = (value) => (typeof value === 'number' ? value : 0);

const readSummary = (payload) => ({
    created: countOf(payload?.created),
    updated: countOf(payload?.updated),
    deleted: countOf(payload?.deleted),
});

const useCalendarExport = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState(null);

    const exportAll = useCallback(async () => {
        setIsExporting(true);
        setError(null);
        setSummary(null);

        try {
            setSummary(readSummary(await api.post('/calendar/export', {})));
        } catch (err) {
            console.error('[calendar export] export failed', err);
            setError(messageOf(err));
        } finally {
            setIsExporting(false);
        }
    }, []);

    const dismissError = useCallback(() => setError(null), []);

    return useMemo(
        () => ({ exportAll, isExporting, summary, error, dismissError }),
        [exportAll, isExporting, summary, error, dismissError]
    );
};

export default useCalendarExport;
