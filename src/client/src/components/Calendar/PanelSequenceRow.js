import React from 'react';

import { usePoolDrag } from '../../hooks/useCalendarDrag';
import useHoverPreview from '../../hooks/useHoverPreview';
import SequencePreviewCard from './SequencePreviewCard';

// One pinned sequence in the pool, mirroring PanelTodoRow: draggable while
// unscheduled, inert with its Day badge once booked. A sequence is one item, so
// there is no info line; hovering shows a read-only preview of its to-dos.

const PanelSequenceRow = ({ item, scheduled = null, isDraggable = false, onOpenSource = null }) => {
    // Unconditional, like PanelTodoRow's: `isDraggable` decides what renders, not
    // whether the hook runs.
    const drag = usePoolDrag(item);
    const { isOpen, triggerProps } = useHoverPreview();

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

    const preview = isOpen ? (
        <div className="panel-sequence-preview">
            <SequencePreviewCard sequence={item} />
        </div>
    ) : null;

    if (scheduled) {
        return (
            <li className={className} {...triggerProps}>
                {title}
                <span className="panel-todo-badge">Day {scheduled.dayIndex + 1}</span>
                {preview}
            </li>
        );
    }

    return (
        <li className={className} ref={isDraggable ? drag.setNodeRef : undefined} {...triggerProps}>
            {isDraggable ? (
                <span className="panel-todo-grip" draggable {...drag.handleProps}>
                    <span aria-hidden="true">⠿</span>
                </span>
            ) : null}
            {title}
            {preview}
        </li>
    );
};

export default PanelSequenceRow;
