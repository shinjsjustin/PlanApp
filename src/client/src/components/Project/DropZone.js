import React from 'react';
import { useDroppable } from '@dnd-kit/core';

import { DROP_TARGET, isEligibleDropTarget } from '../../lib/dragDrop';
import { useActiveDragTodo } from '../../state/DragContext';

// A gap between two to-dos in an expanded sequence card: drop here to land at
// this index (spec section 4.7).
//
// There is one above every to-do and one below the last, so every slot in the
// list can be aimed at. A gap belonging to a sequence that will not take the
// to-do in flight turns itself off rather than accepting a drop and doing
// nothing with it, so collision detection passes straight over it.
//
// It is presentational to a screen reader: the keyboard route through this list
// is the sortable preset on the to-dos themselves, not these.

const DropZone = ({ sequenceId, index }) => {
    const activeTodo = useActiveDragTodo();
    const isEligible = isEligibleDropTarget(activeTodo, sequenceId);

    const { isOver, setNodeRef } = useDroppable({
        id: `gap-${sequenceId}-${index}`,
        disabled: !isEligible,
        data: { dropTarget: { kind: DROP_TARGET.gap, sequenceId, index } },
    });

    const className = [
        'drop-zone',
        isEligible ? 'drop-zone--armed' : '',
        isOver ? 'drop-zone--over' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return <li role="presentation" className={className} ref={setNodeRef} />;
};

export default DropZone;
