import React, { useEffect, useState } from 'react';

import { pushSupport, turnOnPush } from '../../pwa/push';
import '../Styling/Reminders.css';

const HINT = 'To get notifications, add this app to your Home Screen and allow notifications.';
const FAILED = 'Could not turn on notifications. Try again.';

const PushButton = () => {
    const [state, setState] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        pushSupport().then((next) => { if (isCurrent) setState(next); });
        return () => { isCurrent = false; };
    }, []);

    const turnOn = async () => {
        setError(null);
        try {
            setState(await turnOnPush());
        } catch (err) {
            setError(FAILED);
        }
    };

    if (state === null) return null;
    if (state === 'on') return <span className="push-status">Notifications on</span>;
    if (state !== 'off') return <p className="push-hint">{HINT}</p>;

    return (
        <>
            <button type="button" className="neon-button" onClick={turnOn}>Turn on notifications</button>
            {error && <p role="alert" className="places-error">{error}</p>}
        </>
    );
};

export default PushButton;
