import React from 'react';

import { usePoolDrag } from '../../hooks/useCalendarDrag';
import PanelTodoRow from './PanelTodoRow';

// One dated sequence in the pool: a bold block holding its to-dos. The block is
// draggable while unscheduled and inert with its Day badge once booked; each
// to-do inside answers for itself, because a to-do can be booked on its own.

const PanelSequenceRow = ({
    item,
    scheduled = null,
    scheduledByTodoId = null,
    dragFor = null,
    onOpenSource = null,
}) => {
    // Unconditional, like PanelTodoRow's: `canDrag` decides what renders, not
    // whether the hook runs.
    const drag = usePoolDrag(item);
    const canDrag = !scheduled && Boolean(dragFor?.(item));

    const title = onOpenSource ? (
        <button type="button" className="panel-sequence-title" onClick={() => onOpenSource(item)}>
            {item.title}
        </button>
    ) : (
        <span className="panel-todo-text">{item.title}</span>
    );

    const className = [
        'panel-todo-row',
        'panel-sequence-row',
        scheduled ? 'panel-todo-row--scheduled' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <li className={className} ref={canDrag ? drag.setNodeRef : undefined}>
            <div className="panel-sequence-head">
                {canDrag ? (
                    <span className="panel-todo-grip" draggable {...drag.handleProps}>
                        <span aria-hidden="true">⠿</span>
                    </span>
                ) : null}
                {title}
                {scheduled ? (
                    <span className="panel-todo-badge">Day {scheduled.dayIndex + 1}</span>
                ) : null}
            </div>
            {item.todos.length > 0 ? (
                <ul className="panel-sequence-todos">
                    {item.todos.map((todo) => (
                        <PanelTodoRow
                            key={todo.todoId}
                            todo={todo}
                            scheduled={scheduledByTodoId?.get(todo.todoId) ?? null}
                            isDraggable={dragFor ? dragFor(todo) : false}
                        />
                    ))}
                </ul>
            ) : null}
        </li>
    );
};

export default PanelSequenceRow;
