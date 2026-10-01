import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The floating text field a plan schema is pasted into. Like ConfirmDialog it
// renders on the body so no stacking context on the canvas can paint over it.
// What to do with the text is the caller's: onImport(text) returns a promise,
// and a rejection is shown here with the text kept, so a fix is an edit and
// not a re-paste.

const ImportDialog = ({ title, hint, onImport, onClose }) => {
    const textRef = useRef(null);
    const isMountedRef = useRef(true);
    const [text, setText] = useState('');
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        textRef.current?.focus();
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const handleKeyDown = (event) => {
        if (event.key !== 'Escape') return;

        event.preventDefault();
        onClose();
    };

    const handleImport = async () => {
        setIsPending(true);
        setError(null);
        try {
            await onImport(text);
        } catch (err) {
            if (!isMountedRef.current) return;
            setError(err.message);
            setIsPending(false);
            return;
        }
        if (isMountedRef.current) setIsPending(false);
        onClose();
    };

    return createPortal(
        <div className="confirm-dialog-backdrop">
            <div
                className="confirm-dialog import-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onKeyDown={handleKeyDown}
            >
                <p className="confirm-dialog-title">{title}</p>
                <p className="confirm-dialog-message">{hint}</p>

                <textarea
                    ref={textRef}
                    className="import-dialog-text"
                    aria-label="Schema"
                    rows={12}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                />

                {error && <p role="alert" className="import-dialog-error">{error}</p>}

                <div className="confirm-dialog-actions">
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={isPending || text.trim() === ''}
                        onClick={handleImport}
                    >
                        Import
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ImportDialog;
