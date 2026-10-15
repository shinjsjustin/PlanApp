import React, { useEffect, useRef, useState } from 'react';

import { useProjectContext } from '../../state/ProjectContext';
import useSwipe from '../../hooks/useSwipe';
import { sortByPosition } from '../../lib/graph';
import { readLastSequence, writeLastSequence } from '../../lib/lastSequence';
import { buildSequenceGrid, initialSequenceId, stepSequence } from '../../lib/phoneSequences';
import PhoneTodoRow from './PhoneTodoRow';
import '../Styling/ProjectPhone.css';

const PhoneProjectView = () => {
    const { state } = useProjectContext();
    const projectId = state.project.id;
    const grid = buildSequenceGrid(Object.values(state.layers), Object.values(state.sequences));
    const [storedId, setStoredId] = useState(() =>
        initialSequenceId(grid, readLastSequence(projectId))
    );
    // The stored sequence may be gone after a graph reload; fall back to the first.
    const isStoredInGrid = grid.some((r) => r.sequences.some((s) => s.id === storedId));
    const currentId = isStoredInGrid ? storedId : initialSequenceId(grid, null);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (currentId !== null) writeLastSequence(projectId, currentId);
    }, [projectId, currentId]);

    const swipeHandlers = useSwipe({
        scrollRef,
        onSwipe: (direction) => setStoredId(stepSequence(grid, currentId, direction)),
    });

    if (currentId === null) return <p className="phone-empty">No sequences yet</p>;

    const row = grid.find((r) => r.sequences.some((s) => s.id === currentId));
    const sequence = state.sequences[currentId];
    const todos = sortByPosition(
        Object.values(state.todos).filter((t) => t.sequenceId === currentId)
    );
    const index = row.sequences.findIndex((s) => s.id === currentId);

    return (
        <div className="phone-sequence" ref={scrollRef} {...swipeHandlers}>
            <p className="phone-layer-title">{row.layer.title}</p>
            <h2 className="phone-sequence-title">{sequence.title}</h2>
            <p className="phone-sequence-count">{`${index + 1} of ${row.sequences.length}`}</p>
            <ul className="phone-todos">
                {todos.map((todo) => (
                    <PhoneTodoRow key={todo.id} todo={todo} />
                ))}
            </ul>
        </div>
    );
};

export default PhoneProjectView;
