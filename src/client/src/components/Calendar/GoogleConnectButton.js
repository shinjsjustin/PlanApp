import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import useGoogleConnection from '../../hooks/useGoogleConnection';

// Connect or disconnect Google from the calendar header. The OAuth callback
// sends the browser back here with ?google=complete&code&state, which is
// finished with the user's own login, or with ?google=error.

const RESULT_MESSAGES = {
    connected: 'Google connected',
    error: 'Google sign-in failed. Try again.',
};

const GoogleConnectButton = () => {
    const { connected, email, isBusy, error, connect, disconnect, complete } = useGoogleConnection();
    const [params, setSearchParams] = useSearchParams();
    const [outcome, setOutcome] = useState(null);
    const hasStarted = useRef(false);
    const google = params.get('google');
    const code = params.get('code');
    const state = params.get('state');

    useEffect(() => {
        if (google !== 'complete' || !code || !state || hasStarted.current) return;
        hasStarted.current = true;
        complete(code, state).then((isOk) => {
            setOutcome(isOk ? 'connected' : 'error');
            setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                ['google', 'code', 'state'].forEach((key) => next.delete(key));
                return next;
            }, { replace: true });
        });
    }, [google, code, state, complete, setSearchParams]);

    const result = RESULT_MESSAGES[outcome ?? (google === 'error' ? 'error' : null)];

    return (
        <div className="google-connect">
            {connected ? (
                <>
                    <span>Google: {email}</span>
                    <button type="button" className="neon-button" onClick={disconnect} disabled={isBusy}>
                        Disconnect Google
                    </button>
                </>
            ) : (
                <button type="button" className="neon-button" onClick={connect} disabled={isBusy}>
                    Connect Google
                </button>
            )}
            {result && <p role="status">{result}</p>}
            {error && <p role="alert">{error}</p>}
        </div>
    );
};

export default GoogleConnectButton;
