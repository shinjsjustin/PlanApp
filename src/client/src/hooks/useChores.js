import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Owns the active and archived chore lists and talks to /chores. After every action the list
// is reloaded; a failed call leaves the list untouched and surfaces its message
// in `error`. Only the newest request may update state.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const useChores = () => {
    const [loadStatus, setLoadStatus] = useState('loading');
    const [chores, setChores] = useState([]);
    const [archived, setArchived] = useState([]);
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
    const fetchList = useCallback(async () => {
        latestRequest.current += 1;
        const requestId = latestRequest.current;
        const isStale = () => !isMounted.current || requestId !== latestRequest.current;
        try {
            const [active, archivedData] = await Promise.all([
                api.get('/chores'),
                api.get('/chores?archived=true'),
            ]);
            if (isStale()) return 'stale';
            setChores(active.chores);
            setArchived(archivedData.chores);
            setError(null);
            setLoadStatus('ready');
            return 'ready';
        } catch (err) {
            if (isStale()) return 'stale';
            setError(err?.message || GENERIC_FAILURE);
            setLoadStatus('error');
            return 'error';
        }
    }, []);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const reload = useCallback(async () => (await fetchList()) === 'ready', [fetchList]);

    // Runs a call and returns its answer, or `failed` after setting error.
    const attempt = useCallback(async (call, failed) => {
        try {
            return await call();
        } catch (err) {
            if (isMounted.current) setError(err?.message || GENERIC_FAILURE);
            return failed;
        }
    }, []);

    const act = useCallback(async (call) => {
        const ok = await attempt(async () => {
            await call();
            return true;
        }, false);
        return ok && reload();
    }, [attempt, reload]);

    const add = useCallback((fields) => act(() => api.post('/chores', fields)), [act]);
    const edit = useCallback((id, fields) => act(() => api.patch(`/chores/${id}`, fields)), [act]);
    const undo = useCallback(
        (choreId, logId) => act(() => api.delete(`/chores/${choreId}/logs/${logId}`)),
        [act],
    );

    const archive = useCallback((id) => act(() => api.post(`/chores/${id}/archive`)), [act]);
    const restore = useCallback((id) => act(() => api.post(`/chores/${id}/restore`)), [act]);
    const seed = useCallback(() => act(() => api.post('/chores/seed')), [act]);

    const markDone = useCallback(async (id, by) => {
        const answer = await attempt(() => api.post(`/chores/${id}/done`, { by }), null);
        if (!answer) return null;
        if (isMounted.current) {
            setChores((prev) => prev.map((chore) => (chore.id === id ? answer.chore : chore)));
        }
        await reload();
        return answer.log;
    }, [attempt, reload]);

    return { status: loadStatus, chores, archived, error, reload, add, edit, markDone, undo, archive, restore, seed };
};

export default useChores;
