import React from 'react';

// One schedulable to-do in the pool.
//
// Draggable while unscheduled; inert once booked, carrying the day it went to
// (design decision 4). The row stays listed either way, so the panel remains a
// complete answer to "where did this go" — but a booking is moved by grabbing it
// in the day itself, which keeps exactly one gesture per outcome.

const PanelTodoRow = ({ todo, scheduled = null, drag = null }) => {
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
        <li className={className} ref={drag?.setNodeRef} style={drag?.style}>
            <span
                className="panel-todo-grip"
                draggable={drag ? true : undefined}
                aria-hidden={drag ? undefined : 'true'}
                {...(drag?.handleProps ?? {})}
            >
                ⠿
            </span>
            <span className="panel-todo-text">{todo.text}</span>
            <span className="panel-todo-sequence">{todo.sequenceTitle}</span>
        </li>
    );
};

export default PanelTodoRow;
