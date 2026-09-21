import React from 'react';

import { PIN_MODE, usePinSelectionContext } from './PinSelectionContext';

// The pin, as a row wears it.
//
// A to-do is pinned in three places — loose in the panel, in an open card's
// outstanding list, or in the DONE group — and not all of those rows share a
// component. What they do share is exactly two things, which is why
// they are here rather than copied four times: the marker a pinned to-do carries
// all the time, and the one control it offers while a selection is running.
//
// That control is a real button laid over the row, not a click handler on the
// row itself. A row is already several buttons deep — tick, drag handle, ⋯,
// delete × — and a handler on the row would have to work out which of those a
// press was really meant for. A button on top never has to ask: it is the whole
// of the row's surface for as long as the selection lasts, `aria-pressed` says
// whether this row is in the batch, and its name says what confirming would do
// to this particular to-do.
//
// Covering a row is only half of that, though, and it is the half that shows.
// An overlay stops the pointer and does nothing whatsoever about Tab: every
// button underneath it stays in the tab order, still focusable, still firing on
// Enter. `inert` is what actually takes them away — out of the tab order, out of
// the accessibility tree, and out of reach of a click — so the row genuinely has
// one control rather than merely looking as though it does.
//
// Only an eligible row is covered. Pinning something already pinned is not a
// move, so those rows are left alone rather than offered a control that would
// mean nothing, and a row nobody is being asked about keeps its own buttons.

/** What a covered row's control is offering. There is no idle row to label. */
const OPERATION_LABELS = {
    [PIN_MODE.pin]: 'Pin',
    [PIN_MODE.unpin]: 'Unpin',
};

const PIN_GLYPH = '📌';

/**
 * The marker on a pinned to-do. Decorative and permanently so: the pin is a fact
 * about the to-do that the project card elsewhere already reads out, and a
 * second announcement on every row would be noise. Nothing here is clickable —
 * pinning and unpinning happen in batches from the header, never a row at a time.
 */
export const PinIcon = ({ todo }) =>
    todo.isPinned ? (
        <span className="todo-pin-icon" aria-hidden="true">
            {PIN_GLYPH}
        </span>
    ) : null;

/**
 * Everything the row normally is, wrapped so it can be switched off in one move.
 * The wrapper lays out nothing (`display: contents`), so a row looks and
 * measures the same whether or not a selection is running.
 *
 * `inert` is written as an empty string rather than `true` because React 18 does
 * not know the attribute and would drop a boolean with a warning; an empty
 * string is what the DOM stores for a present valueless attribute anyway.
 */
export const PinRowContent = ({ isSelectable, children }) => (
    <div className="todo-item-content" inert={isSelectable ? '' : undefined}>
        {children}
    </div>
);

/**
 * A row's part in the selection: whether it is being asked about, the class that
 * makes it the overlay's containing block, and the overlay itself.
 *
 * Outside a selection — and for a row this operation would not change — the
 * class is empty and the control is null, so a row that is not being chosen
 * renders exactly what it rendered before any of this existed.
 */
export const usePinRow = (todo) => {
    const { mode, isEligible, isSelected, toggle, isSaving } = usePinSelectionContext();
    const isSelectable = isEligible(todo);

    if (!isSelectable) return { isSelectable: false, rowClassName: '', control: null };

    return {
        isSelectable: true,
        rowClassName: 'is-pin-selectable',
        control: (
            <button
                type="button"
                className="pin-select-control"
                disabled={isSaving}
                aria-pressed={isSelected(todo.id)}
                aria-label={`${OPERATION_LABELS[mode]} “${todo.text}”`}
                onClick={() => toggle(todo.id)}
            />
        ),
    };
};
