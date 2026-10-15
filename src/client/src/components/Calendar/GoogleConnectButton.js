import React from 'react';
import { useSearchParams } from 'react-router-dom';

import useGoogleConnection from '../../hooks/useGoogleConnection';

// Connect or disconnect Google from the calendar header. The OAuth callback
// sends the browser back here with ?google=connected or ?google=error.

const RESULT_MESSAGES = {
    connected: 'Google connected',
    error: 'Google sign-in failed. Try again.',
};

const GoogleConnectButton = () => {
    const { connected, email, isBusy, error, connect, disconnect } = useGoogleConnection();
    const [params] = useSearchParams();
    const result = RESULT_MESSAGES[params.get('google')];

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
