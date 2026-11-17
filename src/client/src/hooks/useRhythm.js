import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';

// Loads the rhythm (time zone, anchors, gates) and saves anchor edits. Only the
// latest request may write state: a slow answer must not replace a newer one.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const EMPTY_LIST = [];

const messageOf = (err) => err?.message || GENERIC_FAILURE;

const listOf = (value) => (Array.isArray(value) ? value : EMPTY_LIST);

const INITIAL_STATE = {
    status: 'loading',
    timeZone: null,
    anchors: EMPTY_LIST,
    gates: EMPTY_LIST,
    error: null,
};

const useRhythm = () => {
    const [state, setState] = useState(INITIAL_STATE);
    // Bumped by reload so the same page fetches again.
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let isCurrent = true;

        setState((prev) => ({ ...prev, status: 'loading', error: null }));

        api.get('/rhythm')
            .then((payload) => {
                if (isCurrent) {
                    setState({
                        status: 'ready',
                        timeZone: payload?.timeZone ?? null,
                        anchors: listOf(payload?.anchors),
                        gates: listOf(payload?.gates),
                        error: null,
                    });
                }
            })
            .catch((err) => {
                if (isCurrent) {
                    setState({ ...INITIAL_STATE, status: 'error', error: messageOf(err) });
                }
            });

        return () => {
            isCurrent = false;
        };
    }, [attempt]);

    const reload = useCallback(() => setAttempt((n) => n + 1), []);

    // Rejects with the ApiError so the editor can show it; state stays as it was.
    const saveAnchor = useCallback(async (id, body) => {
        const { anchor } = await api.patch(`/rhythm/anchors/${encodeURIComponent(id)}`, body);

        setState((prev) => ({
            ...prev,
            anchors: prev.anchors.map((a) => (a.id === anchor.id ? anchor : a)),
        }));
    }, []);

    return useMemo(() => ({ ...state, reload, saveAnchor }), [state, reload, saveAnchor]);
};

export default useRhythm;
