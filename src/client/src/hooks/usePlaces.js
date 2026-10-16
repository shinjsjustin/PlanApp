import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Owns the places list and the starting place, and talks to /places. After every
// change the list is reloaded so startPlaceId stays the server's answer; a
// failed call leaves the list untouched and surfaces its message in `error`.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const usePlaces = () => {
    const [status, setStatus] = useState('loading');
    const [places, setPlaces] = useState([]);
    const [startPlaceId, setStartPlaceId] = useState(null);
    const [error, setError] = useState(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const apply = useCallback((data) => {
        setPlaces(data.places);
        setStartPlaceId(data.startPlaceId);
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.get('/places');
                if (!isMounted.current) return;
                apply(data);
                setStatus('ready');
            } catch (err) {
                if (!isMounted.current) return;
                setError(err?.message || GENERIC_FAILURE);
                setStatus('error');
            }
        };
        load();
    }, [apply]);

    // Runs a change, then reloads. Resolves true when applied, false on failure
    // or after unmount.
    const change = useCallback(
        async (call) => {
            try {
                await call();
                const data = await api.get('/places');
                if (!isMounted.current) return false;
                apply(data);
                setError(null);
                return true;
            } catch (err) {
                if (!isMounted.current) return false;
                setError(err?.message || GENERIC_FAILURE);
                return false;
            }
        },
        [apply]
    );

    const add = useCallback((fields) => change(() => api.post('/places', fields)), [change]);
    const edit = useCallback((id, fields) => change(() => api.patch(`/places/${id}`, fields)), [change]);
    const remove = useCallback((id) => change(() => api.delete(`/places/${id}`)), [change]);
    const setStart = useCallback(
        (id) => change(() => api.patch(`/places/${id}`, { isDefaultStart: true })),
        [change]
    );

    return { status, places, startPlaceId, error, add, edit, remove, setStart };
};

export default usePlaces;
