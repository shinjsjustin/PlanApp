import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Owns one place's reminder subcategories. With no place there is nothing to
// list, so the hook stays empty and never calls the API. A failed call leaves
// the list untouched and surfaces its message in `error`.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const useReminderSubcategories = (placeId) => {
    const [status, setStatus] = useState('loading');
    const [subcategories, setSubcategories] = useState([]);
    const [error, setError] = useState(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Resolves true when the list was fetched, false on failure or after unmount.
    const fetchList = useCallback(async () => {
        if (placeId === null || placeId === undefined) {
            setSubcategories([]);
            setError(null);
            return true;
        }
        try {
            const data = await api.get(`/reminder-subcategories?placeId=${placeId}`);
            if (!isMounted.current) return false;
            setSubcategories(data.subcategories);
            setError(null);
            return true;
        } catch (err) {
            if (!isMounted.current) return false;
            setError(err?.message || GENERIC_FAILURE);
            return false;
        }
    }, [placeId]);

    useEffect(() => {
        setStatus('loading');
        fetchList().then((isLoaded) => {
            if (isMounted.current) setStatus(isLoaded ? 'ready' : 'error');
        });
    }, [fetchList]);

    const change = useCallback(async (call) => {
        try {
            await call();
        } catch (err) {
            if (!isMounted.current) return false;
            setError(err?.message || GENERIC_FAILURE);
            return false;
        }
        return fetchList();
    }, [fetchList]);

    const add = useCallback(({ name }) => change(() => api.post('/reminder-subcategories', { placeId, name })), [change, placeId]);
    const rename = useCallback((id, name) => change(() => api.patch(`/reminder-subcategories/${id}`, { name })), [change]);
    const remove = useCallback((id) => change(() => api.delete(`/reminder-subcategories/${id}`)), [change]);

    return { status, subcategories, error, add, rename, remove };
};

export default useReminderSubcategories;
