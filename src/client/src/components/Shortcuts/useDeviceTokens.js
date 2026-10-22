import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../lib/api';

// Owns the device-token list for Shortcuts. The secret token only comes back
// from create, so create resolves with it (or null on failure) and the hook
// never keeps it.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const useDeviceTokens = () => {
    const [status, setStatus] = useState('loading');
    const [tokens, setTokens] = useState([]);
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
                const data = await api.get('/device-tokens');
                if (!isMounted.current) return;
                setTokens(data);
                setStatus('ready');
            } catch (err) {
                if (!isMounted.current) return;
                setError(err?.message || GENERIC_FAILURE);
                setStatus('error');
            }
        };
        load();
    }, []);

    // Runs a change, reloads the list, and resolves with the change's result, or undefined on failure.
    const change = useCallback(async (call) => {
        try {
            const result = await call();
            const data = await api.get('/device-tokens');
            if (!isMounted.current) return undefined;
            setTokens(data);
            setError(null);
            return result;
        } catch (err) {
            if (!isMounted.current) return undefined;
            setError(err?.message || GENERIC_FAILURE);
            return undefined;
        }
    }, []);

    const create = useCallback(
        async (name) => {
            const created = await change(() => api.post('/device-tokens', { name }));
            return created ? created.token : null;
        },
        [change]
    );

    const revoke = useCallback(
        async (id) => (await change(() => api.delete(`/device-tokens/${id}`))) !== undefined,
        [change]
    );

    return { status, tokens, error, create, revoke };
};

export default useDeviceTokens;
