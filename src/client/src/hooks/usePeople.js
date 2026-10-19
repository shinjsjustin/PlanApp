import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Owns the people list and talks to /people. After every change the list is
// reloaded; a failed call leaves the list untouched and surfaces its message in
// `error`. reload() re-fetches quietly for the page to call when a place changes.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const usePeople = () => {
    const [status, setStatus] = useState('loading');
    const [people, setPeople] = useState([]);
    const [error, setError] = useState(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.get('/people');
                if (!isMounted.current) return;
                setPeople(data.people);
                setStatus('ready');
            } catch (err) {
                if (!isMounted.current) return;
                setError(err?.message || GENERIC_FAILURE);
                setStatus('error');
            }
        };
        load();
    }, []);

    // Runs an optional change, then re-fetches. Resolves true when applied,
    // false on failure or after unmount.
    const change = useCallback(async (call) => {
        try {
            if (call) await call();
            const data = await api.get('/people');
            if (!isMounted.current) return false;
            setPeople(data.people);
            setError(null);
            return true;
        } catch (err) {
            if (!isMounted.current) return false;
            setError(err?.message || GENERIC_FAILURE);
            return false;
        }
    }, []);

    const add = useCallback((fields) => change(() => api.post('/people', fields)), [change]);
    const edit = useCallback((id, fields) => change(() => api.patch(`/people/${id}`, fields)), [change]);
    const remove = useCallback((id) => change(() => api.delete(`/people/${id}`)), [change]);
    const reload = useCallback(() => change(), [change]);

    return { status, people, error, add, edit, remove, reload };
};

export default usePeople;
