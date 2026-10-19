import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const DISCARD_MESSAGE = 'Discard this entry?';
const FIELD_SELECTOR = 'input, select, textarea';
const FOCUSABLE_SELECTOR = `${FIELD_SELECTOR}, button, a[href], [tabindex]:not([tabindex="-1"])`;

export const confirmDiscard = (isDirty) => !isDirty || window.confirm(DISCARD_MESSAGE);

// The add and edit form for the Address Book, in a pop-up. It portals onto the
// body for the same stacking reasons as ConfirmDialog.
const FormDialog = ({ title, isDirty, error, onClose, children }) => {
    const panelRef = useRef(null);
    const titleId = useId();

    useEffect(() => {
        const opener = document.activeElement;
        panelRef.current?.querySelector(FIELD_SELECTOR)?.focus();
        return () => opener?.focus?.();
    }, []);

    const requestClose = () => {
        if (confirmDiscard(isDirty)) onClose();
    };

    const trapTab = (event) => {
        const focusable = panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            requestClose();
        } else if (event.key === 'Tab') {
            trapTab(event);
        }
    };

    const handleBackdropMouseDown = (event) => {
        if (event.target === event.currentTarget) requestClose();
    };

    return createPortal(
        <div className="form-dialog-backdrop" onMouseDown={handleBackdropMouseDown}>
            <div
                ref={panelRef}
                className="form-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={handleKeyDown}
            >
                <h2 id={titleId}>{title}</h2>
                {error && <p role="alert" className="form-dialog-error">{error}</p>}
                {children}
            </div>
        </div>,
        document.body
    );
};

export default FormDialog;
