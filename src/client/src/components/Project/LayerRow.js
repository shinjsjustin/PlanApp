import React, { useState } from 'react';

import ConfirmDialog from './ConfirmDialog';
import DeleteBubble from '../common/DeleteBubble';
import InlineTitle from './InlineTitle';
import SequenceCard from './SequenceCard';
import useProjectMutations from '../../hooks/useProjectMutations';
import { sortByPosition } from '../../lib/graph';
import { clientKeyOf } from '../../state/projectReducer';

// One horizontal band of the canvas, plus the slice of the right-hand gutter
// that belongs to it (spec section 4.6).
//
// The row is a flex row and its cards are spaced with `justify-content`; nothing
// is positioned absolutely, so expanding a card simply grows the row. The gutter
// is a real column, rendered whether or not it holds a button, because phase 7
// routes skip-edges down it — the add-sequence button pins to the right of the
// row with `margin-left: auto`, and the add-layer button sits below it in the
// same column.
//
// `sequences` is the whole project's — the row picks out its own, so the canvas
// does not have to group them first. `activeSequenceId` passes straight through:
// the row has no opinion about which card is in operation, but it is the only
// thing standing between the canvas that decides and the card that draws it.

const LayerRow = ({ layer, sequences, todos, activeSequenceId = null }) => {
    const { addLayer, addSequence, deleteLayer, renameLayer } = useProjectMutations();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const own = sortByPosition(sequences.filter((sequence) => sequence.layerId === layer.id));

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
                <section className="layer-row has-delete-bubble" aria-label={layer.title}>
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
                        <ul className="layer-row-sequences">
                            {own.map((sequence) => (
                                <SequenceCard
                                    key={clientKeyOf(sequence)}
                                    sequence={sequence}
                                    todos={todos}
                                    isActive={sequence.id === activeSequenceId}
                                />
                            ))}
                        </ul>
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

            <div className="canvas-layer-footer">
                <div className="canvas-gutter">
                    <button
                        type="button"
                        className="canvas-gutter-button"
                        aria-label={`Add a layer below ${layer.title}`}
                        onClick={() => addLayer(layer.id)}
                    >
                        +
                    </button>
                </div>
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
