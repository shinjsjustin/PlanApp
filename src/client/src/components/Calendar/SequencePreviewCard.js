import React from 'react';

import '../Styling/SequenceCard.css';
import { sequenceCardModel } from '../../lib/sequenceCard';

// Stands in for the real id: the model only needs todos and sequence to agree.
const PREVIEW_SEQUENCE_ID = 'preview';

/** Read-only view of a pool sequence; plain text, no controls. */
export default function SequencePreviewCard({ sequence }) {
    const { title, description, isBlocked, todos } = sequence;
    const model = sequenceCardModel({
        sequence: { id: PREVIEW_SEQUENCE_ID, isBlocked },
        todos: todos.map((todo) => ({ ...todo, sequenceId: PREVIEW_SEQUENCE_ID })),
    });

    return (
        <div role="tooltip" className={`sequence-card sequence-card--state-${model.state}`}>
            <div className="sequence-card-header">
                <span className="sequence-card-title">{title}</span>
                <p className="sequence-card-description">{description}</p>
            </div>
            <ul className="sequence-card-todo-list">
                {model.outstanding.map((todo) => (
                    <li key={todo.id}>{todo.text}</li>
                ))}
            </ul>
            <p>{model.done.length} done</p>
        </div>
    );
}
