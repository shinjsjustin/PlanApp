import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';

// Whether Google is connected, and how to change that. Tokens never reach the
// client: the server only says `connected` and the account's `email`.

const NOT_CONNECTED = { connected: false, email: null };

// Anything but an explicit `connected: true` is "not connected" — including the
// array the pool's mock answers unknown paths with.
const readStatus = (answer) =>
    answer && answer.connected === true
        ? { connected: true, email: answer.email ?? null }
        : NOT_CONNECTED;

const useGoogleConnection = () => {
    const [status, setStatus] = useState(NOT_CONNECTED);
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCurrent = true;

        api.get('/google/status').then(
            (answer) => { if (isCurrent) setStatus(readStatus(answer)); },
            (cause) => {
                if (!isCurrent) return;
                setStatus(NOT_CONNECTED);
                setError(cause.message);
            }
        );

        return () => { isCurrent = false; };
    }, []);

    const run = useCallback(async (action) => {
        setIsBusy(true);
        setError(null);
        try {
            await action();
        } catch (cause) {
            setError(cause.message);
        } finally {
            setIsBusy(false);
        }
    }, []);

    const connect = useCallback(
        () => run(async () => {
            const { url } = await api.post('/google/connect');
            window.location.assign(url);
        }),
        [run]
    );

    const disconnect = useCallback(
        () => run(async () => {
            await api.delete('/google/connection');
            setStatus(NOT_CONNECTED);
        }),
        [run]
    );

    return { ...status, isBusy, error, connect, disconnect };
};

export default useGoogleConnection;
