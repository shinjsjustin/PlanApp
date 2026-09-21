import React from 'react';

import { usePoolDrag } from '../../hooks/useCalendarDrag';

// One pinned to-do in the pool.
//
// Draggable while unscheduled and not complete; inert once booked, carrying the day it went to
// (design decision 4). The row stays listed either way, so the panel remains a
// complete answer to "where did this go" — but a booking is moved by grabbing it
// in the day itself, which keeps exactly one gesture per outcome.
//
// The row calls the drag hook itself rather than being handed the wiring: a hook
// cannot be called from inside the render prop the panel threads down, so what
// comes down is the answer to "may this be dragged", not the machinery.

const TODO_COMPLETE = 'complete';

const PanelTodoRow = ({ todo, scheduled = null, isDraggable = false }) => {
    const canDrag = isDraggable && todo.status !== TODO_COMPLETE;
    // Unconditional, always. `canDrag` decides what is *rendered* — a hook
    // that ran on some renders and not others is the "rendered more hooks than
    // during the previous render" crash. Outside a `DndContext` it is inert, so
    // a row rendered bare in a test costs nothing.
    const drag = usePoolDrag(todo);

    const className = [
        'panel-todo-row',
        `panel-todo-row--${todo.status}`,
        scheduled ? 'panel-todo-row--scheduled' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const pin = todo.isPinned
        ? <span className="calendar-pin-icon" aria-hidden="true">📌</span>
        : null;

    const statusText = [
        todo.isPinned ? 'Pinned.' : '',
        todo.status === 'blocked' ? 'Blocked.' : '',
        todo.status === TODO_COMPLETE ? 'Complete.' : '',
    ].filter(Boolean).join(' ');
    const status = statusText ? <span className="calendar-sr-only">{statusText}</span> : null;

    if (scheduled) {
        return (
            <li className={className}>
                {pin}
                <span className="panel-todo-text">{todo.text}</span>
                {status}
                <span className="panel-todo-badge">Day {scheduled.dayIndex + 1}</span>
            </li>
        );
    }

    return (
        <li className={className} ref={canDrag ? drag.setNodeRef : undefined}>
            {canDrag ? (
                <span className="panel-todo-grip" draggable {...drag.handleProps}>
                    <span aria-hidden="true">⠿</span>
                </span>
            ) : null}
            {pin}
            <span className="panel-todo-text">{todo.text}</span>
            {status}
            <span className="panel-todo-sequence">{todo.sequenceTitle ?? 'Unorganized'}</span>
        </li>
    );
};

export default PanelTodoRow;
