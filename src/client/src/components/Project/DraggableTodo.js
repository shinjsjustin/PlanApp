import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';

import TodoItem from './TodoItem';
import { DROP_TARGET } from '../../lib/dragDrop';

// The two ways a to-do can be picked up (spec section 4.7).
//
// A loose to-do in the unorganized panel is only ever a source: it can be
// carried into a sequence, but nothing may be dropped back onto the panel, so it
// is draggable and not droppable. A to-do inside an expanded sequence card is
// both, because reordering that sequence means dropping one of its to-dos onto
// another — which is what the sortable preset is for.
//
// Neither knows the placement rules. They register what is being dragged and,
// for the sortable one, what landing on it would mean; `DragDropArea` decides
// the rest.

/**
 * Where a row has been dragged to, as a CSS transform. Written out rather than
 * taken from `@dnd-kit/utilities`, which is only a transitive dependency here —
 * translation is the whole of what a to-do row needs, with no scaling to undo.
 */
const translationOf = (transform) =>
    transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined;

/** The wiring both hooks produce, in the shape `TodoItem` renders. */
const dragProps = ({ attributes, listeners, setNodeRef, transform, transition, isDragging }) => ({
    setNodeRef,
    isDragging,
    style: { transform: translationOf(transform), transition },
    handleProps: { ...attributes, ...listeners },
});

/** A to-do in the unorganized panel: a source only. */
export const DraggableTodo = ({ todo }) => {
    const draggable = useDraggable({ id: todo.id, data: { todoId: todo.id } });

    return <TodoItem todo={todo} drag={dragProps(draggable)} />;
};

/**
 * A to-do inside an expanded sequence card. `index` is its place in the list as
 * displayed, which is exactly what a drop onto it means: take this one's place.
 */
export const SortableTodo = ({ todo, index, isTopPinned = false }) => {
    const sortable = useSortable({
        id: todo.id,
        data: {
            todoId: todo.id,
            dropTarget: { kind: DROP_TARGET.item, sequenceId: todo.sequenceId, index },
        },
    });

    return <TodoItem todo={todo} drag={dragProps(sortable)} isTopPinned={isTopPinned} />;
};
