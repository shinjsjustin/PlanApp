import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';

// Loads the lived moments for a date range. LivedView owns this fetch so the
// Plan side never calls /api/lived. Only the latest request may write state:
// a slow answer for an old range must not replace a newer one.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const EMPTY_MOMENTS = [];

const messageOf = (err) => err?.message || GENERIC_FAILURE;

const readMoments = (payload) =>
    Array.isArray(payload?.moments) ? payload.moments : EMPTY_MOMENTS;

const useLivedMoments = ({ from, to }) => {
    const [state, setState] = useState({ status: 'loading', moments: EMPTY_MOMENTS, error: null });
    // Bumped by reload so the same range fetches again.
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let isCurrent = true;

        setState((prev) => ({ ...prev, status: 'loading', error: null }));

        api.get(`/lived?from=${from}&to=${to}`)
            .then((payload) => {
                if (isCurrent) {
                    setState({ status: 'ready', moments: readMoments(payload), error: null });
                }
            })
            .catch((err) => {
                if (isCurrent) {
                    setState({ status: 'error', moments: EMPTY_MOMENTS, error: messageOf(err) });
                }
            });

        return () => {
            isCurrent = false;
        };
    }, [from, to, attempt]);

    const reload = useCallback(() => setAttempt((n) => n + 1), []);

    return useMemo(() => ({ ...state, reload }), [state, reload]);
};

export default useLivedMoments;
