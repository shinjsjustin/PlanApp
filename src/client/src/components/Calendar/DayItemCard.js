import React from 'react';

import { formatTime } from '../../lib/scheduleGeometry';
import { useBookingDrag } from '../../hooks/useCalendarDrag';
import useHoverPreview from '../../hooks/useHoverPreview';
import SequencePreviewCard from './SequencePreviewCard';
import { useDayGeometry } from '../../state/DayScaleContext';

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
// The bubble only ever completes. Un-ticking remains a project-page action;
// the booked card is calendar history and stays where it was placed.

const TODO_COMPLETE = 'complete';

// `resize` is `{ top, bottom }`, each the return of `useResizeEdge` (Task 26).
// Null until then, which is why the edges are absent in this task's tests.
//
// `onOpenSource` is optional for the same reason: with nowhere to go the name is
// plain text rather than a control that does nothing.
const DayItemCard = ({ item, onComplete, onOpenSource = null, isDraggable = false, resize = null, sequence = null }) => {
    // Unconditional, for the same reason `PanelTodoRow`'s is: `isDraggable`
    // decides what is rendered, never whether the hook runs. Inert outside a
    // `DndContext`, so a card rendered bare in a test is the graphic below.
    const drag = useBookingDrag(item);
    const { isOpen, triggerProps } = useHoverPreview();
    const geometry = useDayGeometry();

    const isSequence = item.kind === 'sequence';
    const isComplete = item.status === TODO_COMPLETE;

    const className = [
        'day-item-card',
        isSequence ? 'day-item-card--sequence' : '',
        isComplete ? 'day-item-card--complete' : '',
        item.status === 'blocked' ? 'day-item-card--blocked' : '',
    ]
        .filter(Boolean)
        .join(' ');
    const statusText = [
        item.isPinned ? 'Pinned.' : '',
        item.status === 'blocked' ? 'Blocked.' : '',
        isComplete ? 'Complete.' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={className}
            style={{
                top: `${geometry.minutesToPx(item.startMinutes)}px`,
                height: `${geometry.minutesToPx(item.durationMinutes)}px`,
            }}
            ref={isDraggable ? drag.setNodeRef : undefined}
            {...(isSequence ? triggerProps : {})}
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
                {item.isPinned ? (
                    <span className="calendar-pin-icon" aria-hidden="true">📌</span>
                ) : null}
                {statusText ? <span className="calendar-sr-only">{statusText}</span> : null}

                {isSequence ? null : isComplete ? (
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

            {isSequence && isOpen && sequence ? (
                <div className="panel-sequence-preview">
                    <SequencePreviewCard sequence={sequence} />
                </div>
            ) : null}

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
