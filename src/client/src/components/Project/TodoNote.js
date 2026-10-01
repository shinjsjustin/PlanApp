import React, { useEffect, useRef, useState } from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';

// Matches NOTE_MAX_LENGTH in src/lib/validation.js. CRA cannot import server
// modules; normalization stays at the API boundary.
const NOTE_MAX_LENGTH = 5000;

const stopPropagation = (event) => event.stopPropagation();

const TodoNote = ({ todo }) => {
    const { updateTodoNote } = useProjectMutations();
    // null means follow the graph, including optimistic updates and rollback.
    const [draft, setDraft] = useState(null);
    const draftRef = useRef(null);
    const hasEditRef = useRef(false);
    // The unmount cleanup must see the latest save function, not the first render's.
    const saveRef = useRef(null);
    saveRef.current = (note) => updateTodoNote(todo.id, note);

    const commit = () => {
        if (!hasEditRef.current) return;
        hasEditRef.current = false;
        if (draftRef.current !== (todo.note ?? '')) saveRef.current(draftRef.current);
        setDraft(null);
    };

    useEffect(() => () => {
        if (hasEditRef.current) saveRef.current(draftRef.current);
    }, []);

    const handleKeyDown = (event) => {
        event.stopPropagation();
        if (event.key !== 'Escape') return;
        event.preventDefault();
        hasEditRef.current = false;
        setDraft(null);
    };

    return (
        <textarea
            className="todo-note"
            aria-label={`Note for “${todo.text}”`}
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            autoFocus
            value={draft ?? todo.note ?? ''}
            onChange={(event) => {
                hasEditRef.current = true;
                draftRef.current = event.target.value;
                setDraft(event.target.value);
            }}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            onPointerDown={stopPropagation}
        />
    );
};

export default TodoNote;
