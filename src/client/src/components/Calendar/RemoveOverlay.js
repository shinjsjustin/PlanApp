import React from 'react';
import { useDroppable } from '@dnd-kit/core';

// The pool, turned into a bin for the duration of a drag.
//
// It appears only while a booking that came *from a day* is in the air. A row
// being dragged out of the pool has nowhere to be removed from, and covering the
// panel then would hide the very list the user was dragging out of.
//
// Rendered always and toggled with `hidden` rather than mounted on demand: it is
// a droppable, and dnd-kit has to have registered it before the pointer arrives.
// A droppable that mounts mid-drag is not reliably part of that drag.

const RemoveOverlay = ({ isActive }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: 'remove-from-day',
        disabled: !isActive,
        data: { dropTarget: { remove: true } },
    });

    const className = ['remove-overlay', isOver ? 'remove-overlay--over' : '']
        .filter(Boolean)
        .join(' ');

    return (
        <div ref={setNodeRef} className={className} hidden={!isActive}>
            <p>Drag here to remove from day</p>
        </div>
    );
};

export default RemoveOverlay;
