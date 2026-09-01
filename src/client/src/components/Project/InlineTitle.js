import React, { useEffect, useRef, useState } from 'react';

import useDebouncedCallback from '../../hooks/useDebouncedCallback';

// An editable title, used by both layers and sequences (spec section 4.7).
//
// It saves on blur or Enter through a debounced PATCH — Enter causes a blur, and
// the debounce is what keeps that one gesture from becoming two requests.
// Escape puts the stored value back and takes any pending save with it.
//
// A blank title is refused rather than stored: the server rejects one too, and
// reverting on the spot says so without a round trip.

export const SAVE_DELAY_MS = 400;

const InlineTitle = ({ value, label, onSave, className = '' }) => {
    const [draft, setDraft] = useState(value);
    const [isEditing, setIsEditing] = useState(false);
    const { run: save, cancel } = useDebouncedCallback(onSave, SAVE_DELAY_MS);

    // Escape reverts the draft, but the blur that usually follows carries this
    // render's `draft` in its closure. Normally the revert has re-rendered by
    // then; this flag covers the case where the two land in the same tick, so a
    // reverted edit can never be saved.
    const revertedRef = useRef(false);

    // The stored value wins whenever the field is not being edited, so a
    // reconciled entity — or another change to the same row — shows up. While
    // someone is typing it must not, or their keystrokes would be overwritten.
    useEffect(() => {
        if (isEditing) return;

        setDraft(value);
    }, [value, isEditing]);

    const commit = () => {
        setIsEditing(false);

        if (revertedRef.current) {
            revertedRef.current = false;
            return;
        }

        const trimmed = draft.trim();

        if (trimmed === '' || trimmed === value) {
            setDraft(value);
            return;
        }

        setDraft(trimmed);
        save(trimmed);
    };

    const revert = () => {
        revertedRef.current = true;
        cancel();
        setIsEditing(false);
        setDraft(value);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            revert();
        }
    };

    return (
        <input
            type="text"
            className={`inline-title ${className}`.trim()}
            aria-label={label}
            value={draft}
            onChange={(event) => {
                setIsEditing(true);
                setDraft(event.target.value);
            }}
            onFocus={() => setIsEditing(true)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
        />
    );
};

export default InlineTitle;
