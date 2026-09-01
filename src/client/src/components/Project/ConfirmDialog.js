import React, { useEffect, useRef } from 'react';

// The check before a delete that would take work with it.
//
// Both callers on the canvas — deleting a layer and deleting a sequence — need
// to say the same awkward thing: the to-dos filed underneath are not destroyed,
// they return to the unorganized panel. The copy is the caller's, since only it
// knows how much is at stake; what lives here is the shape of the question and
// the guarantee that Escape is always a way out.

const ConfirmDialog = ({ title, message, confirmLabel, onConfirm, onCancel }) => {
    const cancelRef = useRef(null);

    // Focus lands on Cancel, not on the destructive button, so a stray Enter
    // dismisses rather than deletes.
    useEffect(() => {
        cancelRef.current?.focus();
    }, []);

    const handleKeyDown = (event) => {
        if (event.key !== 'Escape') return;

        event.preventDefault();
        onCancel();
    };

    return (
        <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onKeyDown={handleKeyDown}
        >
            <p className="confirm-dialog-title">{title}</p>
            <p className="confirm-dialog-message">{message}</p>

            <div className="confirm-dialog-actions">
                <button type="button" ref={cancelRef} onClick={onCancel}>
                    Cancel
                </button>
                <button type="button" className="confirm-dialog-confirm" onClick={onConfirm}>
                    {confirmLabel}
                </button>
            </div>
        </div>
    );
};

export default ConfirmDialog;
