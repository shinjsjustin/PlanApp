import React, { useEffect, useState } from 'react';

import DeleteBubble from '../common/DeleteBubble';
import TodoNote from './TodoNote';
import { PIN_MODE, usePinSelectionContext } from './PinSelectionContext';
import { PinIcon, PinRowContent, usePinRow } from './PinRow';
import { completedOnLabel } from '../../lib/dates';

// Finished to-dos, demoted (design 2B.5). They never sit in the main flow again:
// the list above an open card is what is left to do, and everything already done
// collects here behind one line.
//
// Smaller type, a grey fill where the live rows have purple, a thin strikethrough
// and the day it was ticked in the margin — enough to confirm a thing is done and
// to find it again, and not enough to compete with the work that is not.
//
// The group opens itself when it is short and stays shut when it is long, because
// a card that has been worked for a week should not be mostly history. That is a
// first impression, not a preference: once the reader has said either way, their
// choice stands for as long as the card is on screen. It is deliberately not
// persisted — this is a glance, not a setting.
//
// A row's checkbox un-completes it, which is the only way back: clicking it
// returns the to-do to the end of the outstanding list, and the group re-counts.
//
// A done to-do can still be pinned, so these rows join a selection like any
// other. They are written out here rather than borrowed from `TodoItem` — a done
// row has a day in its margin and no menu, and it never had enough in common to
// share — so the covering control is added to them separately, out of the same
// `PinRow` pieces.

const OPEN_BY_DEFAULT_LIMIT = 3;
const CHECK = '✓';

/**
 * One finished to-do. Split out because it is the only part of the group that
 * has to read the selection, and a hook cannot be called from inside the `map`
 * that produces it.
 */
const DoneTodoRow = ({ todo, isTopPinned, onReopenTodo, onDeleteTodo }) => {
    const pinRow = usePinRow(todo);
    const day = completedOnLabel(todo.completedAt);
    const [isNoteOpen, setIsNoteOpen] = useState(false);
    const isIdle = usePinSelectionContext().mode === PIN_MODE.idle;

    // A note is only for reading a row at rest; TodoNote saves a pending edit
    // when it unmounts.
    useEffect(() => {
        if (!isIdle) setIsNoteOpen(false);
    }, [isIdle]);

    const toggleNote = () => {
        if (!isIdle) return;
        setIsNoteOpen((open) => !open);
    };

    const handleTextKeyDown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        toggleNote();
    };

    const className = [
        'sequence-done-item',
        'has-delete-bubble',
        isNoteOpen ? 'todo-item--note-open' : '',
        isTopPinned ? 'todo-row--top-pinned' : '',
        pinRow.rowClassName,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <li className={className}>
            <PinRowContent isSelectable={pinRow.isSelectable}>
                {/* The handle slot is kept empty rather than removed: done rows
                    do not reorder, but the text still has to line up with the
                    live rows above it. */}
                <span className="todo-item-handle-slot" aria-hidden="true" />

                <button
                    type="button"
                    className="todo-check todo-check--done"
                    aria-label={`Mark “${todo.text}” incomplete`}
                    onClick={() => onReopenTodo(todo)}
                >
                    <span aria-hidden="true">{CHECK}</span>
                </button>

                <span
                    className="sequence-done-text todo-item-text--toggle"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isNoteOpen}
                    onClick={toggleNote}
                    onKeyDown={handleTextKeyDown}
                >
                    {todo.text}
                </span>

                {todo.note && (
                    <button
                        type="button"
                        className="todo-item-note-toggle sequence-done-note-toggle"
                        aria-label={`${isNoteOpen ? 'Hide' : 'Show'} note for “${todo.text}”`}
                        onClick={toggleNote}
                    >
                        {isNoteOpen ? '▴' : '▾'}
                    </button>
                )}

                <PinIcon todo={todo} />

                {day && <span className="sequence-done-day">{day}</span>}

                <DeleteBubble
                    label={`Delete “${todo.text}”`}
                    onDelete={() => onDeleteTodo(todo)}
                />
            </PinRowContent>

            {isNoteOpen && (
                <div className="todo-item-note">
                    <TodoNote todo={todo} />
                </div>
            )}

            {pinRow.control}
        </li>
    );
};

const SequenceDoneGroup = ({ todos, topPinnedTodoId = null, onReopenTodo, onDeleteTodo }) => {
    const [isOpen, setIsOpen] = useState(todos.length <= OPEN_BY_DEFAULT_LIMIT);

    if (todos.length === 0) return null;

    return (
        <div className="sequence-done">
            <button
                type="button"
                className="sequence-done-header"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((open) => !open)}
            >
                <span className="sequence-done-label">DONE · {todos.length}</span>
                <span className="sequence-done-rule" aria-hidden="true" />
                <span className="sequence-done-toggle">{isOpen ? 'hide' : 'show'}</span>
            </button>

            {isOpen && (
                <ul className="sequence-done-list">
                    {todos.map((todo) => (
                        <DoneTodoRow
                            key={todo.id}
                            todo={todo}
                            isTopPinned={todo.id === topPinnedTodoId}
                            onReopenTodo={onReopenTodo}
                            onDeleteTodo={onDeleteTodo}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SequenceDoneGroup;
