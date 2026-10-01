import React from 'react';

import { PIN_MODE } from './PinSelectionContext';

// Pinning and unpinning, from the project header.
//
// Two buttons, and two is the whole point: Pin and Unpin are the only things
// that can be started, and once one of them has been started the other cannot
// be — so the pair swaps roles instead of growing into four. The operation being
// run becomes Confirm, and the one that is now impossible becomes Cancel. A
// reader who started the wrong one finds the way out exactly where the other
// operation was, and nothing appears or disappears mid-selection to shift what
// is under the pointer.
//
// Confirm is dead until something is chosen, because an empty batch is a request
// that would change nothing; Cancel never is, because backing out of an empty
// selection is the most likely thing to want. Both go dead while the batch is in
// flight — it is one request for the whole set (spec section 6), and sending it
// twice would be two.

// Selections that predate sequence pinning carry no sequence set.
const NO_SEQUENCES = new Set();

const OPERATION_LABELS = {
    [PIN_MODE.pin]: 'Pin',
    [PIN_MODE.unpin]: 'Unpin',
};

/**
 * What one of the two buttons is for, given the operation it belongs to and what
 * the selection is currently doing. Three plain cases, in the order they happen.
 */
const roleOf = (operation, selection) => {
    const { mode, selectedTodoIds, selectedSequenceIds = NO_SEQUENCES, startPin, startUnpin, cancel, confirm, isSaving } = selection;

    if (mode === PIN_MODE.idle) {
        return {
            label: OPERATION_LABELS[operation],
            onClick: operation === PIN_MODE.pin ? startPin : startUnpin,
            isDisabled: isSaving,
        };
    }

    if (mode === operation) {
        return {
            label: 'Confirm',
            onClick: confirm,
            isDisabled: isSaving || (selectedTodoIds.size === 0 && selectedSequenceIds.size === 0),
        };
    }

    return { label: 'Cancel', onClick: cancel, isDisabled: isSaving };
};

/**
 * Rendered by position and without a key on purpose: each button keeps its own
 * DOM node as its role changes, so the one a reader has just pressed still has
 * focus when it comes back as Confirm.
 */
const RoleButton = ({ role }) => (
    <button
        type="button"
        className="pin-controls-button"
        onClick={role.onClick}
        disabled={role.isDisabled}
    >
        {role.label}
    </button>
);

const PinControls = ({ selection }) => (
    <div className="pin-controls" aria-label="Pin to-dos">
        <RoleButton role={roleOf(PIN_MODE.pin, selection)} />
        <RoleButton role={roleOf(PIN_MODE.unpin, selection)} />
    </div>
);

export default PinControls;
