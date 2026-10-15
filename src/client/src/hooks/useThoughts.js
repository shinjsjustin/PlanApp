import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Owns the thoughts list (newest first) and talks to /thoughts. The server's
// answer is applied after each call; a failed call leaves the list untouched
// and surfaces its message in `error`.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const useThoughts = () => {
    const [status, setStatus] = useState('loading');
    const [thoughts, setThoughts] = useState([]);
    const [error, setError] = useState(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Runs a call, then `apply`s its result; a failure is reported, not thrown.
    // Resolves true when applied, false on failure or after unmount.
    const run = useCallback(async (call, apply) => {
        try {
            const result = await call();
            if (!isMounted.current) return false;
            apply(result);
            setError(null);
            return true;
        } catch (err) {
            if (!isMounted.current) return false;
            setError(err?.message || GENERIC_FAILURE);
            return false;
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.get('/thoughts');
                if (!isMounted.current) return;
                setThoughts(data.thoughts);
                setStatus('ready');
            } catch (err) {
                if (!isMounted.current) return;
                setError(err?.message || GENERIC_FAILURE);
                setStatus('error');
            }
        };
        load();
    }, []);

    const add = useCallback(
        (text) => run(() => api.post('/thoughts', { text }), (thought) => setThoughts((list) => [thought, ...list])),
        [run]
    );

    const edit = useCallback(
        (id, text) =>
            run(
                () => api.patch(`/thoughts/${id}`, { text }),
                (thought) => setThoughts((list) => list.map((t) => (t.id === id ? thought : t)))
            ),
        [run]
    );

    const remove = useCallback(
        (id) =>
            run(
                () => api.delete(`/thoughts/${id}`),
                () => setThoughts((list) => list.filter((t) => t.id !== id))
            ),
        [run]
    );

    const clearAll = useCallback(
        () => run(() => api.delete('/thoughts'), () => setThoughts([])),
        [run]
    );

    return { status, thoughts, error, add, edit, remove, clearAll };
};

export default useThoughts;
