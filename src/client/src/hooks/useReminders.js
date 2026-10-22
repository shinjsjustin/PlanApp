import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Owns the reminder list for one query ({ placeId, status, sort }) and talks to
// /reminders. After every action the list is reloaded; a failed call leaves the
// list untouched and surfaces its message in `error`. Only the newest request
// may update state, so a slow answer to an older query is dropped.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const buildPath = ({ placeId, status, sort }) => {
    const params = new URLSearchParams();
    if (placeId !== undefined && placeId !== null) params.set('placeId', placeId);
    if (status) params.set('status', status);
    if (sort) params.set('sort', sort);
    const query = params.toString();
    return query ? `/reminders?${query}` : '/reminders';
};

const useReminders = ({ placeId, status, sort } = {}) => {
    const path = buildPath({ placeId, status, sort });
    const [loadStatus, setLoadStatus] = useState('loading');
    const [reminders, setReminders] = useState([]);
    const [error, setError] = useState(null);
    const isMounted = useRef(true);
    const latestRequest = useRef(0);
    const pathRef = useRef(path);
    pathRef.current = path;

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Fetches the current query. Resolves 'ready' when applied, 'error' on
    // failure, 'stale' after unmount or when a newer request superseded it.
    const fetchList = useCallback(async () => {
        latestRequest.current += 1;
        const requestId = latestRequest.current;
        const isStale = () => !isMounted.current || requestId !== latestRequest.current;
        try {
            const data = await api.get(pathRef.current);
            if (isStale()) return 'stale';
            setReminders(data.reminders);
            setError(null);
            return 'ready';
        } catch (err) {
            if (isStale()) return 'stale';
            setError(err?.message || GENERIC_FAILURE);
            return 'error';
        }
    }, []);

    useEffect(() => {
        setLoadStatus('loading');
        fetchList().then((outcome) => {
            if (outcome !== 'stale') setLoadStatus(outcome);
        });
    }, [path, fetchList]);

    const reload = useCallback(async () => (await fetchList()) === 'ready', [fetchList]);

    // Runs an action, then reloads. Resolves true when applied, false on failure.
    const act = useCallback(async (call) => {
        try {
            await call();
        } catch (err) {
            if (!isMounted.current) return false;
            setError(err?.message || GENERIC_FAILURE);
            return false;
        }
        return reload();
    }, [reload]);

    const add = useCallback((fields) => act(() => api.post('/reminders', fields)), [act]);
    const edit = useCallback((id, fields) => act(() => api.patch(`/reminders/${id}`, fields)), [act]);
    const remove = useCallback((id) => act(() => api.delete(`/reminders/${id}`)), [act]);
    const done = useCallback((id) => act(() => api.post(`/reminders/${id}/done`)), [act]);
    const dismiss = useCallback((id) => act(() => api.post(`/reminders/${id}/dismiss`)), [act]);
    const reopen = useCallback((id) => act(() => api.post(`/reminders/${id}/reopen`)), [act]);
    const snooze = useCallback((id, until) => act(() => api.post(`/reminders/${id}/snooze`, { until })), [act]);

    return { status: loadStatus, reminders, error, reload, add, edit, remove, done, dismiss, snooze, reopen };
};

export default useReminders;
