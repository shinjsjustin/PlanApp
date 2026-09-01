import React, { useState } from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';

// Adding a to-do inside a sequence card (design 2B.4).
//
// A ghost list item rather than the boxed field and Add button `TodoComposer`
// still gives the unorganized panel: inside a card the list has to read as one
// column, and a form pinned under it broke that column in two. At rest this is a
// dashed circle and grey placeholder in exactly the geometry of a to-do row; on
// a click it becomes a field in the same place, at the same size, with no box
// around it — so the row a person is typing sits where the row they are making
// will.
//
// Rapid entry is the behaviour that matters and is unchanged from the composer
// (spec section 4.7): Enter commits and keeps the field open and focused, so a
// whole list can be typed without touching the mouse. Escape closes it, and so
// does clicking away — with anything typed, leaving commits it rather than
// discarding it, because the text was written to be kept.
//
// Blank text is refused by simply not committing. The composer says so out loud
// because it has room for a line of error; this is one row in a list, and the
// field staying open with the caret in it says the same thing more quietly.

const TodoAddRow = ({ sequenceId, label }) => {
    const { addTodo } = useProjectMutations();
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState('');

    const open = () => {
        setIsEditing(true);
        setText('');
    };

    const close = () => {
        setIsEditing(false);
        setText('');
    };

    /** Commits if there is anything to commit. Says whether it did. */
    const commit = () => {
        const trimmed = text.trim();

        if (trimmed === '') return false;

        setText('');
        // Not awaited: the to-do is on screen optimistically already, and a
        // failure rolls it back and raises a toast from `useProjectGraph`.
        addTodo(trimmed, sequenceId);

        return true;
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    };

    const handleBlur = () => {
        commit();
        close();
    };

    if (isEditing) {
        return (
            <li className="todo-add-row todo-add-row--editing">
                <span className="todo-item-handle-slot" aria-hidden="true" />
                <span className="todo-check todo-check--ghost" aria-hidden="true" />

                <input
                    type="text"
                    // The row was just clicked to become this field; not taking
                    // the caret would make the click mean nothing.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="todo-add-row-field"
                    aria-label={label}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                />
            </li>
        );
    }

    return (
        <li className="todo-add-row">
            {/* A button rather than a div with a click handler: it is one, and
                this is the only way to add a to-do to an open card, so it has to
                be reachable from the keyboard. It is styled to look like the row
                it becomes, not like a button. */}
            <button type="button" className="todo-add-row-open" onClick={open}>
                <span className="todo-item-handle-slot" aria-hidden="true" />
                <span className="todo-check todo-check--ghost" aria-hidden="true" />
                <span className="todo-add-row-placeholder">{label}</span>
            </button>
        </li>
    );
};

export default TodoAddRow;
