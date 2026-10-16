import React, { useEffect, useRef, useState } from 'react';

import { useProjectContext } from '../../state/ProjectContext';
import useSwipe from '../../hooks/useSwipe';
import { sortByPosition } from '../../lib/graph';
import { readLastSequence, writeLastSequence } from '../../lib/lastSequence';
import { buildSequenceGrid, initialSequenceId, layerNeighbours, stepSequence } from '../../lib/phoneSequences';
import PhoneSequenceEditor from './PhoneSequenceEditor';
import PhoneTodoRow from './PhoneTodoRow';
import '../Styling/ProjectPhone.css';

const LayerArrow = ({ direction, glyph, neighbour, onSelect }) => (
    <button
        type="button"
        className={`phone-layer-arrow phone-layer-arrow--${direction}`}
        disabled={!neighbour}
        aria-label={neighbour ? `Layer ${direction === 'up' ? 'above' : 'below'}: ${neighbour.layer.title}` : `No layer ${direction === 'up' ? 'above' : 'below'}`}
        onClick={() => onSelect(neighbour.sequences[0].id)}
    >
        {glyph}
        {neighbour && <span className="phone-layer-arrow-name">{neighbour.layer.title}</span>}
    </button>
);

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
    const [isEditing, setIsEditing] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (currentId !== null) writeLastSequence(projectId, currentId);
    }, [projectId, currentId]);

    const swipeHandlers = useSwipe({
        scrollRef,
        onSwipe: (direction) => {
            if (isEditing) return;
            setStoredId(stepSequence(grid, currentId, direction));
        },
    });

    if (currentId === null) return <p className="phone-empty">No sequences yet</p>;

    const row = grid.find((r) => r.sequences.some((s) => s.id === currentId));
    const sequence = state.sequences[currentId];
    const todos = sortByPosition(
        Object.values(state.todos).filter((t) => t.sequenceId === currentId)
    );
    const { above, below } = layerNeighbours(grid, currentId);
    const index = row.sequences.findIndex((s) => s.id === currentId);

    return (
        <div className="phone-sequence" ref={scrollRef} {...swipeHandlers}>
            <LayerArrow direction="up" glyph="↑" neighbour={above} onSelect={setStoredId} />
            <div className="phone-sequence-scroll">
                <p className="phone-layer-title">{row.layer.title}</p>
                {isEditing ? (
                    <PhoneSequenceEditor sequence={sequence} onDone={() => setIsEditing(false)} />
                ) : (
                    <>
                        <h2 className="phone-sequence-title">{sequence.title}</h2>
                        {sequence.description && (
                            <p className="phone-sequence-description">{sequence.description}</p>
                        )}
                        {sequence.isBlocked && <span className="phone-blocked-badge">Blocked</span>}
                        <button type="button" className="phone-sequence-edit" onClick={() => setIsEditing(true)}>
                            Edit sequence
                        </button>
                    </>
                )}
                <p className="phone-sequence-count">{`${index + 1} of ${row.sequences.length}`}</p>
                <ul className="phone-todos">
                    {todos.map((todo) => (
                        <PhoneTodoRow key={todo.id} todo={todo} />
                    ))}
                </ul>
            </div>
            <LayerArrow direction="down" glyph="↓" neighbour={below} onSelect={setStoredId} />
        </div>
    );
};

export default PhoneProjectView;
