import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';

import ConfirmDialog from './ConfirmDialog';
import DeleteBubble from '../common/DeleteBubble';
import DropZone from './DropZone';
import InlineTitle from './InlineTitle';
import SequenceCardCollapsed from './SequenceCardCollapsed';
import SequenceCardFooter from './SequenceCardFooter';
import SequenceDoneGroup from './SequenceDoneGroup';
import TodoAddRow from './TodoAddRow';
import { SortableSpotlight, SortableTodo } from './DraggableTodo';
import useProjectMutations from '../../hooks/useProjectMutations';
import { DROP_TARGET, isEligibleDropTarget } from '../../lib/dragDrop';
import { TODO_STATUS, sequenceStatus } from '../../lib/graph';
import { CARD_STATE, STATUS_LABELS, sequenceCardModel } from '../../lib/sequenceCard';
import { clientKeyOf } from '../../state/projectReducer';
import { useActiveDragTodo } from '../../state/DragContext';

// One sequence on the canvas.
//
// The card is built around its to-do list, because that is what a person works
// from: the next step is the biggest thing on an open card, what is left sits
// under it in one plain column, and everything already done drops out of that
// column into a group at the bottom. A folded card keeps one line of that — the
// next step, or what it is waiting on — so a canvas read at arm's length still
// says where the work is.
//
// Four faces, decided in `lib/sequenceCard` and never stored: the one sequence
// in operation, a blocked one, a finished one, and the quiet default. Only the
// first carries the ring, and `Canvas` is what makes that exclusive — a card
// cannot see the rest of the graph, so it is told whether it is the active one.
//
// Whether the card is folded *is* stored, on the sequence, so a canvas comes back
// the way it was left. It is the one piece of card chrome that is: the DONE
// group's open state is a glance and stays local to the card.
//
// While a to-do is in the air the card says whether it would take it, because in
// v1 most cards would not: a to-do already filed in a sequence can only be
// reordered inside that same one (spec section 2). An ineligible card marks
// itself and switches its droppables off, so the drop cannot land there and
// quietly do nothing.

// What a click must never toggle the card for. Everything a person operates is
// here — the controls themselves, and the regions built out of them — because
// the card surface is a convenience over the expander button, not a control that
// competes with the ones inside it. The three regions are named as well as the
// controls in them: the spotlight's text, a done row's text and the add row's
// placeholder are all things to read or aim at, and folding the card away under
// a stray click on one of them would be the wrong answer to any of those.
//
// Anything left over is inert face: the header padding, the footer's status
// word, the whitespace of an open body.
const INTERACTIVE_WITHIN_CARD = [
    'button',
    'input',
    'a',
    'label',
    'textarea',
    'select',
    '.todo-item',
    '.todo-add-row',
    '.sequence-spotlight',
    '.sequence-done',
    '.confirm-dialog',
].join(', ');

const SequenceCard = ({
    sequence,
    todos,
    isActive = false,
    highlightedSequenceId = null,
    index,
}) => {
    const {
        deleteSequence,
        deleteTodo,
        renameSequence,
        setSequenceBlocked,
        setSequenceCollapsed,
        setTodoStatus,
    } = useProjectMutations();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const activeDragTodo = useActiveDragTodo();
    const isEligibleTarget = isEligibleDropTarget(activeDragTodo, sequence.id);

    // The card body is the append target: a to-do let go on it joins the end of
    // the list (spec section 4.7). The gaps inside it aim at a given index.
    const { isOver, setNodeRef } = useDroppable({
        id: `sequence-${sequence.id}`,
        disabled: !isEligibleTarget,
        data: { dropTarget: { kind: DROP_TARGET.append, sequenceId: sequence.id } },
    });

    /**
     * The card as something to pick up, and as somewhere to drop another card.
     *
     * The id is prefixed because to-do ids and sequence ids are independent
     * auto-increments, and two bare integers in one `DndContext` could name
     * different things. `dropTarget` carries the LAYER, because where a card
     * lands is a slot in a layer — the card it was dropped on is only how that
     * slot was aimed at.
     */
    const sortable = useSortable({
        id: `seq-${sequence.id}`,
        data: {
            sequenceId: sequence.id,
            dropTarget: { kind: DROP_TARGET.item, layerId: sequence.layerId, index },
        },
    });

    // Everything the card draws, derived from the graph on every render. The
    // status word underneath is still `sequenceStatus`'s, unchanged: the card
    // grew a fourth face, but what the app *says* about a sequence did not.
    const model = sequenceCardModel({ sequence, todos, isActive });
    const status = sequenceStatus(sequence, todos);

    const isCollapsed = Boolean(sequence.isCollapsed);
    const isBlocked = Boolean(sequence.isBlocked);

    // A card arrived at from the calendar flashes briefly to say "here I am".
    // Purely transient and never stored: the page hands it down for a couple of
    // seconds and then stops, so nothing about the sequence itself changes.
    const isSpotlit = sequence.id === highlightedSequenceId;

    // Deleting an empty sequence orphans nothing, so it does not warrant a prompt.
    const ownTodoCount = model.own.length;
    const wouldOrphanWork = ownTodoCount > 0;

    const toggleExpanded = () => setSequenceCollapsed(sequence.id, !isCollapsed);

    /**
     * A to-do's index in the sequence's whole list, which is what a drop target
     * counts in — `resolveTodoPlacement` works over every to-do in the sequence,
     * complete ones included, because that is the order the server stores.
     *
     * The card no longer renders that list in one piece: the first outstanding
     * to-do is in the spotlight, the rest are under THEN, and the finished ones
     * are in the group below. Mapping back through this keeps the split purely
     * visual, so nothing about a drop had to change.
     */
    const indexOf = (todo) => model.own.findIndex((candidate) => candidate.id === todo.id);

    const completeTodo = (todo) => setTodoStatus(todo.id, TODO_STATUS.complete);
    const reopenTodo = (todo) => setTodoStatus(todo.id, TODO_STATUS.incomplete);

    // The card itself opens and closes, so the whole of it is the target rather
    // than the chevron in its corner. The expander button stays the semantic
    // control — it carries `aria-expanded`, it is what the keyboard and a screen
    // reader reach — and this only saves a mouse the trip to it, which is why
    // the `<li>` takes no role and no tab stop: a second tab stop saying the
    // same thing would be noise. A click that landed on something operable is
    // that thing's, not the card's.
    const handleCardClick = (event) => {
        if (event.target.closest(INTERACTIVE_WITHIN_CARD)) return;

        toggleExpanded();
    };

    const requestDelete = () => {
        if (wouldOrphanWork) {
            setIsConfirmingDelete(true);
            return;
        }

        deleteSequence(sequence.id);
    };

    const confirmDelete = () => {
        setIsConfirmingDelete(false);
        deleteSequence(sequence.id);
    };

    const deleteMessage =
        `Its ${ownTodoCount} to-do${ownTodoCount === 1 ? '' : 's'} ` +
        'are not deleted — they return to the unorganized panel, ' +
        'ready to be filed somewhere else.';

    const className = [
        'sequence-card',
        'has-delete-bubble',
        `sequence-card--${status}`,
        `sequence-card--state-${model.state}`,
        isCollapsed ? 'sequence-card--folded' : 'sequence-card--open',
        activeDragTodo ? `sequence-card--${isEligibleTarget ? 'eligible' : 'ineligible'}` : '',
        isOver ? 'sequence-card--over' : '',
        sortable.isDragging ? 'sequence-card--dragging' : '',
        isSpotlit ? 'sequence-card--spotlit' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const chevron = (
        <button
            type="button"
            className="sequence-card-expander"
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${sequence.title}`}
            onClick={toggleExpanded}
        >
            <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
        </button>
    );

    const grip = (
        <button
            type="button"
            className="sequence-card-grip"
            aria-label={`Move ${sequence.title} to another layer`}
            {...sortable.attributes}
            {...sortable.listeners}
        >
            <span aria-hidden="true">⠿</span>
        </button>
    );

    const title = (
        <InlineTitle
            className="sequence-card-title"
            value={sequence.title}
            label={`Sequence title: ${sequence.title}`}
            onSave={(newTitle) => renameSequence(sequence.id, newTitle)}
        />
    );

    // "2 LEFT" until the sequence is blocked, at which point the count is not
    // the thing to say about it.
    const badge = isBlocked ? 'BLOCKED' : `${model.counts.remaining} LEFT`;

    return (
        <li
            ref={sortable.setNodeRef}
            style={{
                transform: sortable.transform
                    ? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
                    : undefined,
                transition: sortable.transition,
            }}
            className={className}
            // Read by the styling, and the one thing a test can check about a
            // drag jsdom cannot otherwise see: which cards would take this to-do.
            data-drop={activeDragTodo ? (isEligibleTarget ? 'eligible' : 'ineligible') : undefined}
            data-state={model.state}
            data-sequence-title={sequence.title}
            onClick={handleCardClick}
        >
            {/* Pinned to the card's corner rather than laid out in the header,
                which reserves the room for it on the right so nothing runs
                underneath. A direct child of the card, because that is what the
                shared reveal keys on: a to-do row inside this card has a × of
                its own, and hovering the card must not light that one up too.

                On the card face rather than in the body, so a collapsed card can
                be deleted without opening it first. The prompt behind it is
                unchanged: a card holding to-dos still asks. */}
            <DeleteBubble
                label={`Delete sequence “${sequence.title}”`}
                onDelete={requestDelete}
            />

            {isCollapsed ? (
                <SequenceCardCollapsed
                    model={model}
                    title={title}
                    onCompleteTodo={completeTodo}
                    grip={grip}
                >
                    {chevron}
                </SequenceCardCollapsed>
            ) : (
                <>
                    <div className="sequence-card-header">
                        {chevron}
                        {grip}

                        <div className="sequence-card-heading">
                            {title}

                            {/* Upright, not italic: an empty description is a
                                blank to fill in, and italics made it read as an
                                aside about the sequence. */}
                            <p
                                className={`sequence-card-description${
                                    sequence.description
                                        ? ''
                                        : ' sequence-card-description--empty'
                                }`}
                            >
                                {sequence.description || 'No description yet.'}
                            </p>
                        </div>

                        <span
                            className={`sequence-card-badge${
                                isBlocked ? ' sequence-card-badge--blocked' : ''
                            }`}
                        >
                            {badge}
                        </span>
                    </div>

                    {/* The gap above the spotlight: dropping here makes a to-do
                        the next step, which is the only way to promote one by
                        hand. The band itself carries no handle — it is the thing
                        being pointed at, not one of the rows. */}
                    {model.next && (
                        <>
                            <ul className="sequence-card-spotlight-slot">
                                <DropZone
                                    sequenceId={sequence.id}
                                    index={indexOf(model.next)}
                                />
                            </ul>

                            <SortableSpotlight
                                todo={model.next}
                                index={indexOf(model.next)}
                                isBlocked={model.state === CARD_STATE.blocked}
                                onComplete={completeTodo}
                            />
                        </>
                    )}

                    <div className="sequence-card-body" ref={setNodeRef}>
                        <div className="sequence-card-then">
                            {/* The label earns its place only when it separates
                                two things. With one outstanding to-do there is
                                nothing under the spotlight to head. */}
                            {model.then.length > 0 && (
                                <div className="sequence-card-section-label">THEN</div>
                            )}

                            <SortableContext
                                items={[model.next, ...model.then]
                                    .filter(Boolean)
                                    .map((todo) => todo.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <ul
                                    className="sequence-card-todo-list"
                                    aria-label={`To-dos in ${sequence.title}`}
                                >
                                    {model.then.map((todo) => (
                                        <React.Fragment key={clientKeyOf(todo)}>
                                            <DropZone
                                                sequenceId={sequence.id}
                                                index={indexOf(todo)}
                                            />
                                            <SortableTodo todo={todo} index={indexOf(todo)} />
                                        </React.Fragment>
                                    ))}

                                    <DropZone sequenceId={sequence.id} index={ownTodoCount} />

                                    <TodoAddRow
                                        sequenceId={sequence.id}
                                        label={`New to-do in ${sequence.title}`}
                                    />
                                </ul>
                            </SortableContext>
                        </div>

                        <SequenceDoneGroup
                            todos={model.done}
                            onReopenTodo={reopenTodo}
                            onDeleteTodo={(todo) => deleteTodo(todo.id)}
                        />
                    </div>

                    <SequenceCardFooter
                        isBlocked={isBlocked}
                        statusLabel={STATUS_LABELS[status]}
                        onToggleBlocked={(next) => setSequenceBlocked(sequence.id, next)}
                    />
                </>
            )}

            {isConfirmingDelete && (
                <ConfirmDialog
                    title={`Delete the sequence “${sequence.title}”?`}
                    message={deleteMessage}
                    confirmLabel="Delete sequence"
                    onConfirm={confirmDelete}
                    onCancel={() => setIsConfirmingDelete(false)}
                />
            )}
        </li>
    );
};

export default SequenceCard;
