import React from 'react';

// The next step, given a band of its own at the top of an open card (design
// 2B.2). It is the one thing on the card the reader is meant to act on, so it is
// the largest type on it and the only tinted area.
//
// Tinted purple when this is the sequence in operation, red when the sequence is
// blocked — the same two colours the folded card uses, so a card says the same
// thing whichever way it is folded. A blocked band's circle is inert for the
// same reason it is inert when folded: unblocking is the move, not ticking.
//
// Rendered only when there is an incomplete to-do. A finished sequence, or an
// empty one, has no next step and gets no band rather than an empty one.
//
// It carries a drag handle like the rows below it: the design draws none in the
// band, but the next step is an incomplete to-do and dragging reorders those, so
// leaving this one pinned would make it the single row on the card nobody could
// move. The handle stays faint until the band is hovered.

const SequenceSpotlight = ({ todo, isBlocked, onComplete, drag = null }) => {
    const className = [
        'sequence-spotlight',
        isBlocked ? 'sequence-spotlight--blocked' : '',
        drag?.isDragging ? 'sequence-spotlight--dragging' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={className} ref={drag?.setNodeRef} style={drag?.style}>
            <div className="sequence-spotlight-eyebrow">
                {isBlocked ? 'WAITING ON' : 'NEXT STEP'}
            </div>

            <div className="sequence-spotlight-row">
                {drag && (
                    <button
                        type="button"
                        className="todo-item-drag-handle sequence-spotlight-handle"
                        {...drag.handleProps}
                        aria-label={`Drag “${todo.text}”`}
                    >
                        ⠿
                    </button>
                )}

                {isBlocked ? (
                    <span className="todo-check todo-check--waiting" aria-hidden="true" />
                ) : (
                    <button
                        type="button"
                        className="todo-check todo-check--next"
                        aria-label={`Complete “${todo.text}”`}
                        onClick={() => onComplete(todo)}
                    />
                )}

                <div className="sequence-spotlight-text">{todo.text}</div>
            </div>
        </div>
    );
};

export default SequenceSpotlight;
