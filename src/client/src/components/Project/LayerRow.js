import React, { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';

import ContextMenu from '../common/ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import ImportDialog from './ImportDialog';
import DeleteBubble from '../common/DeleteBubble';
import InlineTitle from './InlineTitle';
import SequenceCard from './SequenceCard';
import useContextMenu from '../../hooks/useContextMenu';
import useProjectMutations from '../../hooks/useProjectMutations';
import { DROP_TARGET } from '../../lib/dragDrop';
import { sortByPosition } from '../../lib/graph';
import { layerToSchema } from '../../lib/planSchema';
import { clientKeyOf } from '../../state/projectReducer';
import { useActiveDragSequence } from '../../state/DragContext';

const EMPTY_ACTIVE_SEQUENCE_IDS = new Set();
const COPY_STATUS_MS = 2000;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const LAYER_IMPORT_HINT =
    'Paste a plan: "## layer" starts a layer, "### sequence" starts a sequence, ' +
    'and "- todo" adds a to-do. To-dos before the first ### go to Unorganized.';
const SEQUENCE_IMPORT_HINT =
    'Paste sequences: "### sequence" starts a sequence and "- todo" adds a to-do. ' +
    'To-dos before the first ### go to Unorganized.';

const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;

// One horizontal band of the canvas, plus the slice of the right-hand gutter
// that belongs to it (spec section 4.6).
//
// The row is a flex row and its cards are spaced with `justify-content`; nothing
// is positioned absolutely, so expanding a card simply grows the row. The gutter
// is a real column, the same width on every row, so the add-sequence button
// pinned to the right of the row with `margin-left: auto` holds its place as
// rows grow and cards expand. The add-layer button is not in that column at
// all: it is the full-width divider below the row, shaped like the band it
// creates rather than like the card the other button creates.
//
// `sequences` is the whole project's — the row picks out its own, so the canvas
// does not have to group them first. `activeSequenceIds` passes straight through:
// the row has no opinion about which cards contain pins, but it is the only thing
// standing between the canvas that derives the Set and the cards that draw it.
// `highlightedSequenceId` — the card arrived at from the calendar — rides the
// same route for the same reason.

const LayerRow = ({
    layer,
    sequences,
    todos,
    activeSequenceIds = EMPTY_ACTIVE_SEQUENCE_IDS,
    highlightedSequenceId = null,
}) => {
    const { addLayer, addSequence, deleteLayer, renameLayer, importLayer, importSequences } =
        useProjectMutations();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [importing, setImporting] = useState(null);
    const [copyStatus, setCopyStatus] = useState('');
    const copyTimer = useRef(null);
    const layerMenu = useContextMenu();
    const sequenceMenu = useContextMenu();

    const own = sortByPosition(sequences.filter((sequence) => sequence.layerId === layer.id));

    // Set by this layer's + button only, so a sequence arriving any other way
    // (or a rename) never moves the scroller.
    const isRevealRequested = useRef(false);
    const listRef = useRef(null);
    const ownCount = own.length;
    const previousCount = useRef(ownCount);

    useEffect(() => {
        const didGrow = ownCount > previousCount.current;
        previousCount.current = ownCount;

        if (!isRevealRequested.current || !didGrow) return;

        isRevealRequested.current = false;
        const lastCard = listRef.current?.lastElementChild;
        // jsdom and older browsers have no scrollIntoView.
        if (typeof lastCard?.scrollIntoView !== 'function') return;

        lastCard.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'nearest',
        });
    }, [ownCount]);

    useEffect(() => () => clearTimeout(copyTimer.current), []);

    const copySchema = async () => {
        let status = 'Copied';
        try {
            await navigator.clipboard.writeText(layerToSchema(layer, sequences, todos));
        } catch (error) {
            status = 'Copy failed';
        }
        setCopyStatus(status);
        clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopyStatus(''), COPY_STATUS_MS);
    };

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
                        <button
                            type="button"
                            className="layer-row-copy"
                            aria-label={`Copy layer “${layer.title}” as schema`}
                            onClick={copySchema}
                        >
                            ⧉
                        </button>
                        <span className="layer-row-copy-status" role="status">
                            {copyStatus}
                        </span>
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
                            <ul className="layer-row-sequences" ref={listRef}>
                                {own.map((sequence, index) => (
                                    <SequenceCard
                                        key={clientKeyOf(sequence)}
                                        sequence={sequence}
                                        todos={todos}
                                        isActive={activeSequenceIds.has(sequence.id)}
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
                        {...sequenceMenu.triggerProps}
                        onClick={() => {
                            isRevealRequested.current = true;
                            addSequence(layer.id);
                        }}
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
                    {...layerMenu.triggerProps}
                    onClick={() => addLayer(layer.id)}
                >
                    <span className="layer-divider-glyph" aria-hidden="true">
                        +
                    </span>
                </button>
            </div>

            {layerMenu.menu && (
                <ContextMenu
                    x={layerMenu.menu.x}
                    y={layerMenu.menu.y}
                    label="Layer actions"
                    items={[{ label: 'Import layer…', onSelect: () => setImporting('layer') }]}
                    onClose={layerMenu.close}
                />
            )}
            {sequenceMenu.menu && (
                <ContextMenu
                    x={sequenceMenu.menu.x}
                    y={sequenceMenu.menu.y}
                    label="Sequence actions"
                    items={[{ label: 'Import sequences…', onSelect: () => setImporting('sequences') }]}
                    onClose={sequenceMenu.close}
                />
            )}
            {importing === 'layer' && (
                <ImportDialog
                    title="Import layer"
                    hint={LAYER_IMPORT_HINT}
                    onImport={(text) => importLayer(text, layer.id)}
                    onClose={() => setImporting(null)}
                />
            )}
            {importing === 'sequences' && (
                <ImportDialog
                    title="Import sequences"
                    hint={SEQUENCE_IMPORT_HINT}
                    onImport={(text) => importSequences(layer.id, text)}
                    onClose={() => setImporting(null)}
                />
            )}

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
