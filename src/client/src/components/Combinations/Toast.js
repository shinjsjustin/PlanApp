import React, { useEffect } from 'react';

const TOAST_MS = 3200;

// Shows the page's message and asks the page to clear it after TOAST_MS.
const Toast = ({ message, onClear }) => {
    useEffect(() => {
        if (!message) return undefined;
        const timer = setTimeout(onClear, TOAST_MS);
        return () => clearTimeout(timer);
    }, [message, onClear]);

    return message ? <div className="toast" role="status">{message}</div> : null;
};

export default Toast;
