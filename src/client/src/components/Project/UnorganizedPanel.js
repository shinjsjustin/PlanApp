import React, { useState } from 'react';

import ConfirmDialog from './ConfirmDialog';
import TodoComposer from './TodoComposer';
import { DraggableTodo } from './DraggableTodo';
import { sortByPosition } from '../../lib/graph';
import useProjectMutations from '../../hooks/useProjectMutations';
import { clientKeyOf } from '../../state/projectReducer';
import { useProjectContext } from '../../state/ProjectContext';

// The panel of loose to-dos: those whose `sequenceId` is null.
//
// It is a filter over the project's to-dos, not a collection of its own (spec
// section 4.2). That is what makes it self-maintaining: a to-do sent back from a
// sequence, or freed when a sequence was deleted, appears here without the panel
// being told anything, because the only thing that changed is a column.
//
// It floats over the canvas rather than taking a column beside it, so the page
// is one thing and it scrolls as one thing. It is docked to the bottom-right
// corner: the top-left is where the first layer's title and its cards are, and a
// panel that opened over those would have to be closed before the page could be
// used. Being an overlay is what makes collapsing worth having — folded down it
// is a pill in the corner, and whatever it was covering is whole again.
//
// It starts collapsed to keep the canvas clear. The header count keeps loose
// to-dos visible even while the list itself is out of sight.
//
// Its to-dos can be dragged out into a sequence, but nothing can be dropped back
// in: the panel registers no droppable of its own, and a to-do leaves a sequence
// through its menu instead (spec section 2).

const UnorganizedPanel = () => {
    const { state } = useProjectContext();
    const { deleteAllUnorganized } = useProjectMutations();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const todos = sortByPosition(
        Object.values(state.todos).filter((todo) => todo.sequenceId === null)
    );

    const className = `unorganized-panel${isExpanded ? '' : ' unorganized-panel--collapsed'}`;

    return (
        <aside className={className}>
            <button
                type="button"
                className="unorganized-panel-toggle"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((expanded) => !expanded)}
            >
                {/* The same chevron a sequence card uses, and for the same
                    reason: the shape says which way this goes, and the label
                    beside it is left to say what it is. */}
                <span className="unorganized-panel-chevron" aria-hidden="true">
                    {isExpanded ? '▾' : '▸'}
                </span>
                Unorganized ({todos.length})
            </button>

            {isExpanded && (
                <div className="unorganized-panel-body">
                    {todos.length === 0 ? (
                        <p className="unorganized-panel-empty">
                            Nothing waiting to be filed. To-dos added here stay loose until you
                            put them in a sequence.
                        </p>
                    ) : (
                        <ul className="unorganized-panel-list" aria-label="Unorganized to-dos">
                            {todos.map((todo) => (
                                <DraggableTodo key={clientKeyOf(todo)} todo={todo} />
                            ))}
                        </ul>
                    )}

                    {todos.length > 0 && (
                        <button
                            type="button"
                            className="unorganized-panel-delete-all"
                            onClick={() => setIsConfirmingDelete(true)}
                        >
                            Delete all
                        </button>
                    )}

                    <TodoComposer sequenceId={null} label="New unorganized to-do" />
                </div>
            )}

            {isConfirmingDelete && (
                <ConfirmDialog
                    title={`Delete all ${todos.length} unorganized to-dos?`}
                    message="Their bookings and pins are deleted with them."
                    confirmLabel={`Delete all ${todos.length} to-dos`}
                    onConfirm={() => {
                        setIsConfirmingDelete(false);
                        deleteAllUnorganized();
                    }}
                    onCancel={() => setIsConfirmingDelete(false)}
                />
            )}
        </aside>
    );
};

export default UnorganizedPanel;
