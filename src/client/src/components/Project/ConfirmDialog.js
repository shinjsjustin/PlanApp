import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// The check before a delete that would take work with it.
//
// Both callers on the canvas — deleting a layer and deleting a sequence — need
// to say the same awkward thing: the to-dos filed underneath are not destroyed,
// they return to the unorganized panel. The copy is the caller's, since only it
// knows how much is at stake; what lives here is the shape of the question and
// the guarantee that Escape is always a way out.
//
// It renders through a portal onto the body rather than where it is written,
// because where it is written is inside a card, inside a layer row that carries
// its own `z-index`, and — while a card is being dragged — inside a `transform`.
// Either of those makes a stacking context, and inside one no `z-index` the
// dialog gives itself can lift it over what is outside: the row below would
// paint over the buttons, and a transformed ancestor would even take `fixed`
// positioning away from it. On the body it has no ancestor to be trapped under.

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

    // The backdrop is what dims the page and catches the clicks meant for it, so
    // the only things clickable while the question stands are its two answers.
    return createPortal(
        <div className="confirm-dialog-backdrop">
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
        </div>,
        document.body
    );
};

export default ConfirmDialog;
