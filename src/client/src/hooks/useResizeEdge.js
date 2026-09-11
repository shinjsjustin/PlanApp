import { useCallback, useEffect, useRef, useState } from 'react';

import { MIN_DURATION } from '../lib/schedule';
import { clampDuration, pxToMinutes, snapToSlot } from '../lib/scheduleGeometry';

// Dragging the top or bottom edge of a booking.
//
// Not a dnd-kit drag. The sensor's activation distance exists so a click on a
// button is not swallowed by a drag, and it is exactly wrong for a 6px edge whose
// first pixel of movement is the gesture. Raw pointer events, captured on the
// handle, are both simpler and more accurate here.
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
 * Wires one edge. `onPreview` is called on every move with the rectangle so far
 * — the caller runs the cascade and renders it — and `onCommit` once on release.
 * `onCancel` fires on Escape, so a resize can be abandoned the same way a drag
 * can.
 */
const useResizeEdge = ({ item, edge, floor, onPreview, onCommit, onCancel }) => {
    const [isResizing, setIsResizing] = useState(false);
    const originRef = useRef(0);
    const latestRef = useRef(null);

    const handlePointerDown = useCallback(
        (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);

            originRef.current = event.clientY;
            latestRef.current = null;
            setIsResizing(true);
        },
        []
    );

    const handlePointerMove = useCallback(
        (event) => {
            if (!isResizing) return;

            const deltaMinutes = snapToSlot(pxToMinutes(event.clientY - originRef.current));
            const rect = rectFor(item, { edge, deltaMinutes, floor });

            latestRef.current = rect;
            onPreview(rect);
        },
        [edge, floor, isResizing, item, onPreview]
    );

    const handlePointerUp = useCallback(() => {
        if (!isResizing) return;

        setIsResizing(false);

        if (latestRef.current) onCommit(latestRef.current);
        else onCancel();
    }, [isResizing, onCancel, onCommit]);

    // Escape abandons a resize in flight, matching what it does to a drag.
    useEffect(() => {
        if (!isResizing) return undefined;

        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;

            setIsResizing(false);
            latestRef.current = null;
            onCancel();
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isResizing, onCancel]);

    return {
        isResizing,
        handleProps: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp,
        },
    };
};

export default useResizeEdge;
