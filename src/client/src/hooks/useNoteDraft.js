import { useCallback, useEffect, useState } from 'react';

import { DAY_MINUTES, MIN_DURATION } from '../lib/schedule';
import { clampStart, snapToSlot } from '../lib/scheduleGeometry';

// Pressing and dragging on empty notes background to describe a new note
// (design 2026-09-16, section 8.2).
//
// Raw pointer events rather than a dnd-kit sensor, for the same reason
// `useResizeEdge` uses them: the sensor's activation distance exists so a click
// on a button is not swallowed by a drag, and it is exactly wrong for a gesture
// whose first pixel of movement *is* the gesture. Here it would also swallow the
// press-with-no-movement case, which is half the feature.
//
// One draft at a time, and that is not a simplification: there is one pointer.
//
// Nothing is created until the release, and nothing at all if the day has no
// room. The refusal is the ghost itself (section 8.4) — shown while the user is
// still describing the range, rather than reported as an error afterwards.

/** What a press with no movement books, before any dragging. */
export const DEFAULT_NOTE_DURATION = 30;

/**
 * The range between two minutes on the grid.
 *
 * Dragging upward is the same gesture as dragging down: the earlier of the two
 * is the start. A press that never moved has both the same, and gets the default
 * block rather than a zero-length note.
 *
 * Held inside the day at the bottom (decision 8) — a note may not cross
 * midnight, so a press at 23:30 can only ever be half an hour. `clampStart`
 * already keeps the start itself inside.
 */
export const rangeFor = (pressedAt, releasedAt) => {
    const from = Math.min(pressedAt, releasedAt);
    const to = Math.max(pressedAt, releasedAt);

    const wanted = to === from ? DEFAULT_NOTE_DURATION : to - from;
    const roomLeft = DAY_MINUTES - from;

    return {
        startMinutes: from,
        durationMinutes: Math.max(MIN_DURATION, Math.min(wanted, roomLeft)),
    };
};

/**
 * `geometry` is the live scale — where a pointer is in minutes depends on how
 * tall the window let the column be.
 *
 * `canPlaceAt(dayId, range)` is the live refusal, asked on every frame. The
 * caller answers it from `lib/noteLanes`' `canPlace` against that day's notes.
 *
 * `onCommit({ dayId, startMinutes, durationMinutes })` runs once, on a release
 * the day had room for.
 */
const useNoteDraft = ({ geometry, canPlaceAt, onCommit }) => {
    const [gesture, setGesture] = useState(null);

    /**
     * The minute a client Y coordinate is over, within the plane that was
     * pressed.
     *
     * The plane's own rect rather than the column's: `getBoundingClientRect`
     * already accounts for the column's inner scroll, so no scroll offset is
     * added — the same reasoning `minutesAtRect` records for a drop.
     */
    const minuteAt = useCallback(
        (clientY, planeTop) => clampStart(snapToSlot(geometry.pxToMinutes(clientY - planeTop))),
        [geometry]
    );

    const startDraft = useCallback(
        (dayId, event) => {
            // Only the primary button. A right-click on the plane belongs to the
            // browser, and a middle-click must not leave a draft stuck down.
            if (event.button !== undefined && event.button !== 0) return;

            event.preventDefault();
            event.stopPropagation();

            const planeTop = event.currentTarget.getBoundingClientRect().top;
            const pressedAt = minuteAt(event.clientY, planeTop);

            setGesture({ dayId, planeTop, pressedAt, at: pressedAt });
        },
        [minuteAt]
    );

    useEffect(() => {
        if (!gesture) return undefined;

        const onPointerMove = (event) => {
            const at = minuteAt(event.clientY, gesture.planeTop);

            // Held rather than replaced when the minute has not changed, so a
            // pointer moving within one slot re-renders no ribbons.
            setGesture((current) =>
                current && current.at !== at ? { ...current, at } : current
            );
        };

        const onPointerUp = () => {
            const range = rangeFor(gesture.pressedAt, gesture.at);

            setGesture(null);

            // A release the day has no room for does nothing at all — no
            // request, no message. The ghost already said so.
            if (!canPlaceAt(gesture.dayId, range)) return;

            onCommit({ dayId: gesture.dayId, ...range });
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);

        return () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
        };
    }, [gesture, minuteAt, canPlaceAt, onCommit]);

    // Escape abandons a draft, matching what it does to a drag and to a resize.
    useEffect(() => {
        if (!gesture) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') setGesture(null);
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [gesture]);

    const draft = gesture
        ? (() => {
              const range = rangeFor(gesture.pressedAt, gesture.at);

              return {
                  dayId: gesture.dayId,
                  ...range,
                  isAllowed: canPlaceAt(gesture.dayId, range),
              };
          })()
        : null;

    return { draft, startDraft };
};

export default useNoteDraft;
