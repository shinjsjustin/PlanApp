import React from 'react';

import '../Styling/DeleteBubble.css';

// The one way to delete anything in this app: a small red × pinned to the
// top-right corner of the thing it would remove — a project card, a layer row, a
// sequence card, a to-do.
//
// It is quiet by default and shows itself when the item is hovered or when the ×
// itself takes keyboard focus. That reveal is entirely CSS, in
// `Styling/DeleteBubble.css`: the button is always rendered, always in the tab
// order and always in the accessibility tree, so the only thing hover changes is
// how visible it is. A `display: none` would have taken it out of the tab order
// and made the whole affordance pointer-only.
//
// Deleting is where an unlabelled icon does the most damage, so `label` is
// required rather than defaulted — the × itself is decorative and hidden, and the
// name is the only thing that says what is about to be removed.
//
// The host does two things: it puts `has-delete-bubble` on the element the reveal
// hangs off (which must also be a positioning context), and it decides what the
// click means. Every confirmation this replaces still lives in the host, so the ×
// opens the same prompt the old text button did.

const DeleteBubble = ({ label, onDelete, className = '' }) => {
    // A nameless delete button is the failure this component exists to prevent,
    // and a silent default would let it ship. Loud and immediate instead.
    if (!label) {
        throw new Error('DeleteBubble needs a label naming what it would delete.');
    }

    return (
        <button
            type="button"
            className={['delete-bubble', className].filter(Boolean).join(' ')}
            aria-label={label}
            onClick={onDelete}
        >
            <span aria-hidden="true">×</span>
        </button>
    );
};

export default DeleteBubble;
