import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';

import ConfirmDialog from './ConfirmDialog';
import DeleteBubble from '../common/DeleteBubble';
import InlineTitle from './InlineTitle';
import SequenceCard from './SequenceCard';
import useProjectMutations from '../../hooks/useProjectMutations';
import { DROP_TARGET } from '../../lib/dragDrop';
import { sortByPosition } from '../../lib/graph';
import { clientKeyOf } from '../../state/projectReducer';
import { useActiveDragSequence } from '../../state/DragContext';

// One horizontal band of the canvas, plus the slice of the right-hand gutter
// that belongs to it (spec section 4.6).
//
// The row is a flex row and its cards are spaced with `justify-content`; nothing
// is positioned absolutely, so expanding a card simply grows the row. The gutter
// is a real column, rendered whether or not it holds a button, because phase 7
// routes skip-edges down it — the add-sequence button pins to the right of the
// row with `margin-left: auto`. The add-layer button is not in that column at
// all: it is the full-width divider below the row, shaped like the band it
// creates rather than like the card the other button creates.
//
// `sequences` is the whole project's — the row picks out its own, so the canvas
// does not have to group them first. `activeSequenceId` passes straight through:
// the row has no opinion about which card is in operation, but it is the only
// thing standing between the canvas that decides and the card that draws it.
// `highlightedSequenceId` — the card arrived at from the calendar — rides the
// same route for the same reason.

const LayerRow = ({
    layer,
    sequences,
    todos,
    activeSequenceId = null,
    highlightedSequenceId = null,
}) => {
    const { addLayer, addSequence, deleteLayer, renameLayer } = useProjectMutations();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const own = sortByPosition(sequences.filter((sequence) => sequence.layerId === layer.id));

    const activeDragSequence = useActiveDragSequence();

    // Dropping on the row's own space appends to this layer. Disabled unless a
    // sequence is actually in the air, so it never competes with a to-do drag
    // for the pointer.
    const { isOver, setNodeRef } = useDroppable({
        id: `layer-${layer.id}`,
        disabled: !activeDragSequence,
        data: { dropTarget: { kind: DROP_TARGET.append, layerId: layer.id } },
    });

    // Deleting an empty layer orphans nothing, so it does not warrant a prompt.
    const wouldOrphanWork = own.length > 0;

    const requestDelete = () => {
        if (wouldOrphanWork) {
            setIsConfirmingDelete(true);
            return;
        }

        deleteLayer(layer.id);
    };

    const confirmDelete = () => {
        setIsConfirmingDelete(false);
        deleteLayer(layer.id);
    };

    const deleteMessage =
        `Its ${own.length} sequence${own.length === 1 ? '' : 's'} ` +
        'will be deleted with it. The to-dos filed in them are not deleted — ' +
        'they return to the unorganized panel.';

    return (
        <div className="canvas-layer">
            <div className="canvas-layer-main">
                <section
                    ref={setNodeRef}
                    className={['layer-row', 'has-delete-bubble', isOver ? 'layer-row--over' : '']
                        .filter(Boolean)
                        .join(' ')}
                    aria-label={layer.title}
                >
                    <div className="layer-row-header">
                        <h2 className="layer-row-title">
                            <InlineTitle
                                value={layer.title}
                                label={`Layer title: ${layer.title}`}
                                onSave={(title) => renameLayer(layer.id, title)}
                            />
                        </h2>
                    </div>

                    {/* Named with its kind: the sequences inside this row carry
                        a × of their own, and "Delete “Learning”" twice over
                        would say nothing about which is which. A direct child
                        of the row, because that is what the shared reveal keys
                        on — hovering the row must not light up the × on every
                        card and to-do inside it. */}
                    <DeleteBubble
                        label={`Delete layer “${layer.title}”`}
                        onDelete={requestDelete}
                    />

                    {own.length === 0 ? (
                        <p className="layer-row-empty">No sequences in this layer yet.</p>
                    ) : (
                        <SortableContext
                            items={own.map((sequence) => `seq-${sequence.id}`)}
                            strategy={horizontalListSortingStrategy}
                        >
                            <ul className="layer-row-sequences">
                                {own.map((sequence, index) => (
                                    <SequenceCard
                                        key={clientKeyOf(sequence)}
                                        sequence={sequence}
                                        todos={todos}
                                        isActive={sequence.id === activeSequenceId}
                                        highlightedSequenceId={highlightedSequenceId}
                                        index={index}
                                    />
                                ))}
                            </ul>
                        </SortableContext>
                    )}
                </section>

                <div className="canvas-gutter">
                    <button
                        type="button"
                        className="canvas-gutter-button"
                        aria-label={`Add a sequence to ${layer.title}`}
                        onClick={() => addSequence(layer.id)}
                    >
                        +
                    </button>
                </div>
            </div>

            {/* A band-shaped control, because it makes a band. The add-sequence
                button above is a circle, because it makes a card. The two used
                to be the same + a few pixels apart in the same column, which
                said nothing about which was which. */}
            <div className="canvas-layer-footer">
                <button
                    type="button"
                    className="layer-divider"
                    aria-label={`Add a layer below ${layer.title}`}
                    onClick={() => addLayer(layer.id)}
                >
                    <span className="layer-divider-glyph" aria-hidden="true">
                        +
                    </span>
                </button>
            </div>

            {isConfirmingDelete && (
                <ConfirmDialog
                    title={`Delete the layer “${layer.title}”?`}
                    message={deleteMessage}
                    confirmLabel="Delete layer and its sequences"
                    onConfirm={confirmDelete}
                    onCancel={() => setIsConfirmingDelete(false)}
                />
            )}
        </div>
    );
};

export default LayerRow;
