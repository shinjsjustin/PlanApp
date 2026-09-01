import React, { useRef, useState } from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';

// The one way a to-do is written down, used by both the unorganized panel and an
// expanded sequence card (spec section 4.5). `sequenceId` of null files it in the
// panel; a sequence id files it in that sequence. Nothing else differs, so
// nothing else is duplicated.
//
// The behaviour that matters is rapid entry (spec section 4.7): Enter submits,
// the field clears, and focus stays on it, so a whole list can be typed in
// without touching the mouse. The add button does the same and hands focus back.
//
// Blank input is refused here rather than sent: the server rejects it too, and
// saying so on the spot is both faster and clearer than a toast after a round
// trip.

export const EMPTY_TEXT_MESSAGE = 'A to-do needs some text.';

const TodoComposer = ({ sequenceId = null, label = 'New to-do' }) => {
    const { addTodo } = useProjectMutations();
    const [text, setText] = useState('');
    const [error, setError] = useState(null);
    const fieldRef = useRef(null);

    const submit = (event) => {
        event.preventDefault();

        const trimmed = text.trim();

        // Focus is restored on both paths: after a rejection so the mistake can
        // be corrected, and after an add so the next to-do can be typed.
        fieldRef.current?.focus();

        if (trimmed === '') {
            setError(EMPTY_TEXT_MESSAGE);
            return;
        }

        setError(null);
        setText('');

        // Not awaited: the to-do is on screen optimistically already, and a
        // failure rolls it back and raises a toast from `useProjectGraph`.
        addTodo(trimmed, sequenceId);
    };

    const handleChange = (event) => {
        setText(event.target.value);

        if (error) setError(null);
    };

    return (
        <form className="todo-composer" onSubmit={submit}>
            <div className="todo-composer-row">
                <input
                    type="text"
                    ref={fieldRef}
                    className="todo-composer-field"
                    aria-label={label}
                    value={text}
                    onChange={handleChange}
                />
                <button type="submit" className="todo-composer-add">
                    Add
                </button>
            </div>

            {error && (
                <p className="todo-composer-error" role="alert">
                    {error}
                </p>
            )}
        </form>
    );
};

export default TodoComposer;
