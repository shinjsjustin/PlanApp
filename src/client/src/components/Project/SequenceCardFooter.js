import React from 'react';

// The bar under an open card (design 2B.6): the blocked toggle on the left, the
// derived status word on the right.
//
// The toggle was a checkbox and is now a pill, which is a change of shape rather
// than of meaning — it is still the one manual override on a sequence, and it
// still wins over everything derived. A pill because the footer is a strip of
// chrome and a bare checkbox floating in one read as an unfinished form.
//
// It stays a real toggle to anything that is not a mouse: `aria-pressed` is what
// says on or off, so a screen reader hears the same two states the fill shows.
//
// The status word is `sequenceStatus`'s, unchanged — the same sentence the
// projects home page and the server's frontier tell about this sequence. Only
// the place it is printed moved.

const SequenceCardFooter = ({ isBlocked, statusLabel, onToggleBlocked }) => (
    <div className="sequence-card-footer">
        <button
            type="button"
            className={`sequence-blocked-toggle${isBlocked ? ' sequence-blocked-toggle--on' : ''}`}
            aria-pressed={isBlocked}
            onClick={() => onToggleBlocked(!isBlocked)}
        >
            <span className="sequence-blocked-dot" aria-hidden="true" />
            Blocked
        </button>

        <span className="sequence-card-status">{statusLabel}</span>
    </div>
);

export default SequenceCardFooter;
