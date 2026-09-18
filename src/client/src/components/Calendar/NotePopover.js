import React, { useEffect, useRef, useState } from 'react';

import { formatTime } from '../../lib/scheduleGeometry';

// Where a note is written, and the only place it can be (design section 8.2).
//
// A ribbon is ~20px wide with its text on its side, so there is nowhere in it to
// put a usable input. The popover is a horizontal field beside the ribbon
// instead — and since it has to exist anyway, it is also where Delete lives,
// which keeps the ribbon free of a hover × it has no room for.
//
// It does double duty: the same surface names a note that does not exist yet and
// renames one that does. `onDelete` is what tells them apart — a note with no
// row behind it has nothing to delete.
//
// An empty save creates nothing. That is what makes a stray press on the plane
// harmless: press, see the field, press Escape or Enter, and the calendar is
// exactly as it was, with no row written and no litter to tidy up.

const NotePopover = ({ range, text = '', onSave, onCancel, onDelete = null, style = null }) => {
    const [value, setValue] = useState(text);
    const inputRef = useRef(null);
    const rootRef = useRef(null);

    // Focused on open so the common case is press-and-type. Selected as well, so
    // renaming an existing note is one gesture rather than a select-all first.
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    // A click anywhere else is a cancel, which is what makes this feel like a
    // popover rather than a dialog. `mousedown` rather than `click`: a press that
    // starts outside must not also land as a press on the plane underneath and
    // begin a second draft.
    useEffect(() => {
        const onPointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) onCancel();
        };

        document.addEventListener('mousedown', onPointerDown);

        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [onCancel]);

    /** Trimmed, and an empty note is a cancel rather than a save of nothing. */
    const save = () => {
        const trimmed = value.trim();

        if (trimmed.length === 0) {
            onCancel();
            return;
        }

        onSave(trimmed);
    };

    const onKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            save();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="note-popover" ref={rootRef} style={style ?? undefined}>
            <span className="note-popover-range">
                {formatTime(range.startMinutes)}–
                {formatTime(range.startMinutes + range.durationMinutes)}
            </span>

            <label className="note-popover-field">
                <span className="note-popover-label">Note</span>
                <input
                    ref={inputRef}
                    type="text"
                    maxLength={500}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={onKeyDown}
                />
            </label>

            <div className="note-popover-actions">
                <button type="button" className="note-popover-save" onClick={save}>
                    Save
                </button>

                {onDelete && (
                    <button type="button" className="note-popover-delete" onClick={onDelete}>
                        Delete
                    </button>
                )}
            </div>
        </div>
    );
};

export default NotePopover;
