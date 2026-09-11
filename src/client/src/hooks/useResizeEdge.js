import { useCallback, useEffect, useRef, useState } from 'react';

import { MIN_DURATION } from '../lib/schedule';
import { clampDuration, pxToMinutes, snapToSlot } from '../lib/scheduleGeometry';

// Dragging the top or bottom edge of a booking.
//
// Not a dnd-kit drag. The sensor's activation distance exists so a click on a
// button is not swallowed by a drag, and it is exactly wrong for a 6px edge whose
// first pixel of movement is the gesture. Raw pointer events, started on the
// handle and then followed on `document`, are both simpler and more accurate
// here.
//
// The two edges are not symmetric, and that asymmetry is decision 7:
//
//   - The bottom edge changes the duration and may run past midnight. That is
//     not an error to prevent; it is the input to the spill.
//   - The top edge changes the start and holds the end still, and it *clamps* at
//     the end of the item above rather than pushing it. The cascade only ever
//     runs downward, and letting one edge push upward would make the item above
//     move while the user was dragging the one below.

export const EDGE = { top: 'top', bottom: 'bottom' };

/**
 * The rectangle an edge drag asks for. Pure, so every clamp is testable without
 * a pointer.
 *
 * `floor` is the earliest the top edge may reach — `topEdgeFloor` from
 * `lib/schedule`, which is the end of the item above or midnight.
 */
export const rectFor = (item, { edge, deltaMinutes, floor }) => {
    if (edge === EDGE.bottom) {
        return {
            startMinutes: item.startMinutes,
            durationMinutes: clampDuration(item.durationMinutes + deltaMinutes),
        };
    }

    const end = item.startMinutes + item.durationMinutes;
    const wanted = snapToSlot(item.startMinutes + deltaMinutes);

    // The floor is the outer clamp, so it is the one that wins when the two
    // disagree. They only can in a degenerate arrangement — an item above that
    // ends at or after this one's last legal start — and there, starting before
    // the floor would overlap the item above, which the top edge may never do.
    // Holding the end still is the lesser rule, and gives way first.
    const startMinutes = Math.max(Math.min(wanted, end - MIN_DURATION), floor);

    return { startMinutes, durationMinutes: clampDuration(end - startMinutes) };
};

/**
 * The one resize gesture the calendar can have in flight, wired once above every
 * column.
 *
 * Above, and not on the card, because a bottom edge dragged past midnight moves
 * its own booking into the next day *during* the gesture: React unmounts the
 * card from one column's subtree and mounts a fresh one in the next column's.
 * Anything the card owned — which edge is held, where the pointer went down, the
 * `document` listeners — dies with it, and the release is never heard, so the
 * resize is previewed and never saved. Moving the listeners off the edge span was
 * not enough; the component itself is what goes. The gesture outlives the card,
 * so it has to live somewhere the spill cannot reach.
 *
 * One at a time is not a simplification: there is one pointer.
 *
 * `resolve(todoId, edge)` returns the `{ item, floor }` the gesture measures
 * against — the *committed* booking, read once when the pointer goes down. Every
 * frame's delta is measured from that origin, so re-reading a rectangle the
 * previous frame already moved would read 30 minutes of travel as 60. It returns
 * null for a to-do with no booking to resize, and the press is then ignored.
 *
 * `onPreview(todoId, rect)` is called on every move — the caller runs the cascade
 * and renders it — and `onCommit(todoId, rect)` once on release. `onCancel` fires
 * on Escape, so a resize can be abandoned the same way a drag can.
 */
const useResizeEdge = ({ resolve, onPreview, onCommit, onCancel }) => {
    const [gesture, setGesture] = useState(null);
    const latestRef = useRef(null);

    const startResize = useCallback(
        (todoId, edge, event) => {
            event.preventDefault();
            event.stopPropagation();

            const resolved = resolve(todoId, edge);
            if (!resolved) return;

            latestRef.current = null;
            setGesture({ todoId, edge, ...resolved, originY: event.clientY });
        },
        [resolve]
    );

    const handlePointerMove = useCallback(
        (event) => {
            if (!gesture) return;

            const deltaMinutes = snapToSlot(pxToMinutes(event.clientY - gesture.originY));
            const rect = rectFor(gesture.item, {
                edge: gesture.edge,
                deltaMinutes,
                floor: gesture.floor,
            });

            latestRef.current = rect;
            onPreview(gesture.todoId, rect);
        },
        [gesture, onPreview]
    );

    const handlePointerUp = useCallback(() => {
        if (!gesture) return;

        const rect = latestRef.current;

        latestRef.current = null;
        setGesture(null);

        if (rect) onCommit(gesture.todoId, rect);
        else onCancel();
    }, [gesture, onCancel, onCommit]);

    // On `document` rather than on the edge span, which is the other half of the
    // same problem: the span the press landed on is gone once the booking spills,
    // and a pointer that has left a 6px handle is still resizing either way.
    useEffect(() => {
        if (!gesture) return undefined;

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerUp);

        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [gesture, handlePointerMove, handlePointerUp]);

    // Escape abandons a resize in flight, matching what it does to a drag.
    useEffect(() => {
        if (!gesture) return undefined;

        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;

            latestRef.current = null;
            setGesture(null);
            onCancel();
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [gesture, onCancel]);

    return {
        activeEdge: gesture ? { todoId: gesture.todoId, edge: gesture.edge } : null,
        startResize,
    };
};

export default useResizeEdge;
