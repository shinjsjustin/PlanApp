import React from 'react';

import { formatTime, minutesToPx } from '../../lib/scheduleGeometry';
import { useBookingDrag } from '../../hooks/useCalendarDrag';

// One booking, drawn over the grid at the minute it starts and as tall as it
// lasts (design section 8).
//
// Three controls, and each answers a different question about the same to-do:
// the bubble finishes it, the graphic moves it, the name says where it came from.
//
// Ticking does not move the card. The point of completing something on a
// calendar is to see what the day actually looked like, and a card that jumped
// to a "done" pile would take that away — so the item stays exactly where it is
// and is struck through.
//
// The bubble only ever completes. Un-ticking is a project-page action: the pool
// here offers a sequence's *next* step, so a to-do un-ticked on the calendar
// would have nowhere coherent to reappear, and the card would be claiming to
// schedule work the frontier no longer offers.

const TODO_COMPLETE = 'complete';

// `resize` is `{ top, bottom }`, each the return of `useResizeEdge` (Task 26).
// Null until then, which is why the edges are absent in this task's tests.
//
// `onOpenSource` is Task 28's, and is absent the same way: until something can
// be opened the name is plain text rather than a control that does nothing.
const DayItemCard = ({ item, onComplete, onOpenSource = null, isDraggable = false, resize = null }) => {
    // Unconditional, for the same reason `PanelTodoRow`'s is: `isDraggable`
    // decides what is rendered, never whether the hook runs. Inert outside a
    // `DndContext`, so a card rendered bare in a test is the graphic below.
    const drag = useBookingDrag(item.todoId);

    const isComplete = item.status === TODO_COMPLETE;

    const className = ['day-item-card', isComplete ? 'day-item-card--complete' : '']
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={className}
            style={{
                top: `${minutesToPx(item.startMinutes)}px`,
                height: `${minutesToPx(item.durationMinutes)}px`,
            }}
            ref={isDraggable ? drag.setNodeRef : undefined}
        >
            {resize && (
                <span
                    className="day-item-edge day-item-edge--top"
                    role="separator"
                    aria-label={`Change when “${item.text}” starts`}
                    {...resize.top.handleProps}
                />
            )}

            <div className="day-item-row">
                {isComplete ? (
                    <button
                        type="button"
                        className="day-item-bubble day-item-bubble--done"
                        aria-label={`Completed “${item.text}”`}
                        disabled
                        title="Un-tick this on its project page"
                    />
                ) : (
                    <button
                        type="button"
                        className="day-item-bubble"
                        aria-label={`Complete “${item.text}”`}
                        onClick={() => onComplete(item.todoId)}
                    />
                )}

                {isDraggable ? (
                    <button
                        type="button"
                        className="day-item-handle"
                        aria-label={`Move “${item.text}”`}
                        {...drag.handleProps}
                    >
                        ⠿
                    </button>
                ) : (
                    <span className="day-item-handle" aria-hidden="true">
                        ⠿
                    </span>
                )}

                {onOpenSource ? (
                    <button
                        type="button"
                        className="day-item-name"
                        onClick={() => onOpenSource(item)}
                    >
                        {item.text}
                    </button>
                ) : (
                    <span className="day-item-name">{item.text}</span>
                )}
            </div>

            <span className="day-item-time">
                {formatTime(item.startMinutes)}–
                {formatTime(item.startMinutes + item.durationMinutes)}
            </span>

            {resize && (
                <span
                    className="day-item-edge day-item-edge--bottom"
                    role="separator"
                    aria-label={`Change how long “${item.text}” takes`}
                    {...resize.bottom.handleProps}
                />
            )}
        </div>
    );
};

export default DayItemCard;
