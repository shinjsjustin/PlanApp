import React, { useState } from 'react';

import DeleteBubble from '../common/DeleteBubble';
import useProjectMutations from '../../hooks/useProjectMutations';
import { TODO_STATUS } from '../../lib/graph';

// One to-do, in the unorganized panel or under THEN inside an open sequence card.
//
// The status control is a checkbox rather than the three-state cycle it was. A
// list is read as done or not done, and the card around it is built on that
// reading — the next step, what is left, what is finished — so the control on a
// row answers the same question the card does, in one click either way.
//
// `blocked` did not go away with the cycle; it moved into the menu. It is a real
// thing to say about a to-do and it is still said — a blocked row keeps its own
// mark — but it is the rarer of the two answers, and putting it a click deeper
// is what lets the common one be a checkbox. A blocked to-do can still be
// ticked: being stuck and being finished are different claims, and finishing one
// wins.
//
// The menu is also how a to-do leaves a sequence. Dragging one back to the panel
// is out of scope for v1 (spec section 2), so this is the only way out — and a
// to-do already in the panel has nowhere to go, so it is offered only the
// blocked entry.
//
// Deleting is not in that menu. It is the shared × every deletable thing in the
// app carries, revealed on hovering the row: one delete path rather than a menu
// entry and a corner button that do the same thing.
//
// Dragging is done by an explicit handle rather than by the whole row. The
// checkbox and the menu are buttons of their own, and a row that was itself the
// drag surface would have to guess which presses were meant for them; a separate
// handle never has to. A row with no handle still reserves its width, so text in
// the panel lines up with text in a card.

const STATUS_LABELS = {
    [TODO_STATUS.incomplete]: 'Incomplete',
    [TODO_STATUS.complete]: 'Complete',
    [TODO_STATUS.blocked]: 'Blocked',
};

const CHECK = '✓';

const TodoItem = ({ todo, drag = null }) => {
    const { setTodoStatus, moveTodoToUnorganized, deleteTodo } = useProjectMutations();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const isFiled = todo.sequenceId !== null;
    const isComplete = todo.status === TODO_STATUS.complete;
    const isBlocked = todo.status === TODO_STATUS.blocked;
    const statusLabel = STATUS_LABELS[todo.status] ?? todo.status;

    /**
     * Ticking and un-ticking. Un-ticking a to-do that was blocked returns it to
     * plain incomplete rather than to blocked: the block was cleared the moment
     * it was finished, and silently restoring it would be a claim nobody made.
     */
    const toggleComplete = () =>
        setTodoStatus(todo.id, isComplete ? TODO_STATUS.incomplete : TODO_STATUS.complete);

    const toggleBlocked = () => {
        setIsMenuOpen(false);
        setTodoStatus(todo.id, isBlocked ? TODO_STATUS.incomplete : TODO_STATUS.blocked);
    };

    const moveOut = () => {
        setIsMenuOpen(false);
        moveTodoToUnorganized(todo.id);
    };

    const handleMenuKeyDown = (event) => {
        if (event.key !== 'Escape') return;

        event.preventDefault();
        setIsMenuOpen(false);
    };

    const className = [
        'todo-item',
        'has-delete-bubble',
        `todo-item--${todo.status}`,
        drag?.isDragging ? 'todo-item--dragging' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const checkClassName = [
        'todo-check',
        isComplete ? 'todo-check--done' : '',
        isBlocked ? 'todo-check--blocked' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <li className={className} ref={drag?.setNodeRef} style={drag?.style}>
            {drag ? (
                <button
                    type="button"
                    className="todo-item-drag-handle"
                    {...drag.handleProps}
                    aria-label={`Drag “${todo.text}”`}
                >
                    ⠿
                </button>
            ) : (
                <span className="todo-item-handle-slot" aria-hidden="true" />
            )}

            {/* The label says the state and what the click will do, because the
                circle carries no text of its own and a `checkbox` role would
                promise a third state this control does not have. */}
            <button
                type="button"
                className={checkClassName}
                aria-pressed={isComplete}
                aria-label={
                    isComplete
                        ? `Mark “${todo.text}” incomplete`
                        : `Complete “${todo.text}” (${statusLabel})`
                }
                onClick={toggleComplete}
            >
                {isComplete && <span aria-hidden="true">{CHECK}</span>}
            </button>

            <span className="todo-item-text">{todo.text}</span>

            <button
                type="button"
                className="todo-item-menu-toggle"
                aria-expanded={isMenuOpen}
                aria-label={`Actions for “${todo.text}”`}
                onClick={() => setIsMenuOpen((open) => !open)}
            >
                ⋯
            </button>

            {/* A to-do has nothing filed under it, so there is nothing to warn
                about: the × deletes it outright, as the menu entry always did. */}
            <DeleteBubble
                label={`Delete “${todo.text}”`}
                onDelete={() => deleteTodo(todo.id)}
            />

            {/*
                A disclosure of plain buttons rather than an ARIA `menu`. A real
                menu widget promises arrow-key navigation and managed focus;
                claiming the role without them would mislead a screen reader
                more than the toggle's `aria-expanded` already tells it.
            */}
            {isMenuOpen && (
                <ul
                    className="todo-item-menu"
                    aria-label={`Actions menu for “${todo.text}”`}
                    onKeyDown={handleMenuKeyDown}
                >
                    <li>
                        <button type="button" onClick={toggleBlocked}>
                            {isBlocked ? 'Clear blocked' : 'Mark blocked'}
                        </button>
                    </li>

                    {/* Only a filed to-do has somewhere to go; one already in
                        the panel is offered no move rather than a move onto the
                        list it is already on. */}
                    {isFiled && (
                        <li>
                            <button type="button" onClick={moveOut}>
                                Move to unorganized
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </li>
    );
};

export default TodoItem;
