import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Owns one chore's done-marks and talks to /chores/:id/logs. After every action the logs
// are reloaded; a failed call leaves them untouched and surfaces its message in `error`.
// Only the newest request may update state.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const useChoreLogs = (choreId) => {
    const [status, setStatus] = useState('loading');
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState(null);
    const isMounted = useRef(true);
    const latestRequest = useRef(0);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Resolves 'ready' when applied, 'error' on failure, 'stale' after unmount
    // or when a newer request superseded it.
    const fetchLogs = useCallback(async () => {
        latestRequest.current += 1;
        const requestId = latestRequest.current;
        const isStale = () => !isMounted.current || requestId !== latestRequest.current;
        try {
            const answer = await api.get(`/chores/${choreId}/logs`);
            if (isStale()) return 'stale';
            setLogs(answer.logs);
            setError(null);
            setStatus('ready');
            return 'ready';
        } catch (err) {
            if (isStale()) return 'stale';
            setError(err?.message || GENERIC_FAILURE);
            setStatus('error');
            return 'error';
        }
    }, [choreId]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const reload = useCallback(async () => (await fetchLogs()) === 'ready', [fetchLogs]);

    const act = useCallback(async (call) => {
        try {
            await call();
        } catch (err) {
            if (isMounted.current) setError(err?.message || GENERIC_FAILURE);
            return false;
        }
        return reload();
    }, [reload]);

    const add = useCallback((fields) => act(() => api.post(`/chores/${choreId}/done`, fields)), [act, choreId]);
    const edit = useCallback(
        (logId, fields) => act(() => api.patch(`/chores/${choreId}/logs/${logId}`, fields)),
        [act, choreId],
    );
    const remove = useCallback(
        (logId) => act(() => api.delete(`/chores/${choreId}/logs/${logId}`)),
        [act, choreId],
    );

    return { status, logs, error, reload, add, edit, remove };
};

export default useChoreLogs;
