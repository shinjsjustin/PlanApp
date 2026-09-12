import React from 'react';

import { usePoolDrag } from '../../hooks/useCalendarDrag';

// One schedulable to-do in the pool.
//
// Draggable while unscheduled; inert once booked, carrying the day it went to
// (design decision 4). The row stays listed either way, so the panel remains a
// complete answer to "where did this go" — but a booking is moved by grabbing it
// in the day itself, which keeps exactly one gesture per outcome.
//
// The row calls the drag hook itself rather than being handed the wiring: a hook
// cannot be called from inside the render prop the panel threads down, so what
// comes down is the answer to "may this be dragged", not the machinery.

const PanelTodoRow = ({ todo, scheduled = null, isDraggable = false }) => {
    // Unconditional, always. `isDraggable` decides what is *rendered* — a hook
    // that ran on some renders and not others is the "rendered more hooks than
    // during the previous render" crash. Outside a `DndContext` it is inert, so
    // a row rendered bare in a test costs nothing.
    const drag = usePoolDrag(todo);

    const className = ['panel-todo-row', scheduled ? 'panel-todo-row--scheduled' : '']
        .filter(Boolean)
        .join(' ');

    if (scheduled) {
        return (
            <li className={className}>
                <span className="panel-todo-text">{todo.text}</span>
                <span className="panel-todo-badge">Day {scheduled.dayIndex + 1}</span>
            </li>
        );
    }

    return (
        <li className={className} ref={isDraggable ? drag.setNodeRef : undefined}>
            <span
                className="panel-todo-grip"
                draggable={isDraggable ? true : undefined}
                aria-hidden={isDraggable ? undefined : 'true'}
                {...(isDraggable ? drag.handleProps : {})}
            >
                ⠿
            </span>
            <span className="panel-todo-text">{todo.text}</span>
            <span className="panel-todo-sequence">{todo.sequenceTitle}</span>
        </li>
    );
};

export default PanelTodoRow;
