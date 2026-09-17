import React from 'react';

import { MAX_NOTE_LANES } from '../../lib/noteLanes';
import { formatTime } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';
import { useNoteDrag } from '../../hooks/useCalendarDrag';

// One note, drawn over the grid at the minute it starts and as tall as it lasts.
//
// A narrow vertical bar rather than a card, and the text is rotated to read
// bottom-to-top (decision 3). That is what makes overlap affordable: a
// horizontal card needs ~120px to carry a readable label, so four overlapping
// notes would want 480px of plane; a ribbon carries the same label in ~20px and
// grows along the axis a time block already has to spare.
//
// The whole ribbon is one target. There is no separate drag handle and no hover
// ×, because at this width there is no room for either — the body is the button
// that opens the popover, and the dnd sensor's activation distance is what keeps
// a click from being swallowed by a drag. Deleting happens in the popover.
//
// Two edges, and unlike a booking's they are symmetric: notes may overlap, so a
// top edge has nothing above it to clamp against. What they may not do is leave
// the day, which `canPlace` enforces on the caller's side.

/** Lane 0 is the rightmost, so the two planes build out from the boundary. */
const laneStyle = (lane) => ({
    right: `${(lane * 100) / MAX_NOTE_LANES}%`,
    width: `${100 / MAX_NOTE_LANES}%`,
});

/**
 * `lane` is the index from `assignLanes`, or null for a note it could not place.
 * An unplaceable note is still drawn — in lane 0, marked — rather than dropped:
 * every client gesture is refused before it can make one, so this only arises
 * from data that got past the server, and a ribbon that silently vanished would
 * be much harder to explain than one that looks wrong.
 *
 * `resize` is `{ top, bottom }` and `onOpen` is optional, both for the same
 * reasons `DayItemCard`'s are: a ribbon rendered bare in a test is the plain
 * graphic below.
 */
const NoteRibbon = ({ note, lane, onOpen = null, isDraggable = false, resize = null }) => {
    const geometry = useDayGeometry();

    // Unconditional, like `DayItemCard`'s: `isDraggable` decides what is
    // rendered, never whether the hook runs. Inert outside a `DndContext`.
    const drag = useNoteDrag(note.id);

    const isUnplaceable = lane === null;

    const className = ['note-ribbon', isUnplaceable ? 'note-ribbon--unplaceable' : '']
        .filter(Boolean)
        .join(' ');

    const range = `${formatTime(note.startMinutes)}–${formatTime(
        note.startMinutes + note.durationMinutes
    )}`;

    return (
        <div
            className={className}
            style={{
                top: `${geometry.minutesToPx(note.startMinutes)}px`,
                height: `${geometry.minutesToPx(note.durationMinutes)}px`,
                ...laneStyle(isUnplaceable ? 0 : lane),
            }}
            ref={isDraggable ? drag.setNodeRef : undefined}
        >
            {resize && (
                <span
                    className="note-ribbon-edge note-ribbon-edge--top"
                    role="separator"
                    aria-label={`Change when “${note.text}” starts`}
                    {...resize.top.handleProps}
                />
            )}

            {onOpen ? (
                <button
                    type="button"
                    className="note-ribbon-body"
                    // The time is in the label rather than printed: a ribbon has
                    // no room for a second line, but a screen reader has no
                    // reason to go without it.
                    aria-label={`${note.text}, ${range}`}
                    onClick={() => onOpen(note.id)}
                    {...(isDraggable ? drag.handleProps : {})}
                >
                    <span className="note-ribbon-text">{note.text}</span>
                </button>
            ) : (
                <span className="note-ribbon-body">
                    <span className="note-ribbon-text">{note.text}</span>
                </span>
            )}

            {resize && (
                <span
                    className="note-ribbon-edge note-ribbon-edge--bottom"
                    role="separator"
                    aria-label={`Change how long “${note.text}” lasts`}
                    {...resize.bottom.handleProps}
                />
            )}
        </div>
    );
};

export default NoteRibbon;
