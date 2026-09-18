import React, { useMemo } from 'react';

import NoteRibbon from './NoteRibbon';
import { assignLanes } from '../../lib/noteLanes';
import { useDayGeometry } from '../../state/DayScaleContext';

// The left half of a day column: four lanes of free-floating context
// (design 2026-09-16, section 8.1).
//
// The lanes are not elements. A ribbon is positioned from its lane index, the
// way a booking is positioned from its start time, so there is nothing here for
// four empty tracks to be — and nothing for a screen reader to wade through
// either. The plane is one group holding however many notes there are.
//
// Nothing in here settles anything. That is the whole difference between this
// and the to-do plane: notes overlap rather than push (decision 2), so the only
// question a note asks is which lane it is drawn in, and `assignLanes` answers
// it from the day's notes alone.
//
// `ribbonFor` exists for the same reason `DayColumn`'s `cardFor` does: a
// resizable, draggable ribbon needs a hook per edge, and hooks cannot be called
// from a loop in here. The wrapper that owns the gestures supplies them; absent,
// the plane draws plain ribbons. A caller that takes the render over owns the
// key.

/**
 * `draft` is the create gesture in flight — `{ startMinutes, durationMinutes,
 * isAllowed }` — drawn as a ghost so the user can see the range they are
 * describing, and see it refused before they let go (design section 8.4).
 *
 * `droppable` is `{ setNodeRef, className }` from the wrapper that has the
 * `DndContext`. ITS CLASSES ARE APPENDED TO THE PLANE'S OWN, never substituted
 * for them: a caller passes whatever it wants to add — its own base plus a
 * hover modifier, say — and `note-plane` is on the element regardless. A caller
 * that assumed replacement would be quietly wrong, because the rules that
 * position the plane, size it and make it a containing block for its lanes all
 * hang off `note-plane` and would still be applying. `className` may be left
 * off entirely, which adds nothing; this differs from `DayColumn`'s booking
 * droppable, which has no class of its own and simply takes the caller's.
 */
const NotePlane = ({
    dayId,
    notes,
    label = 'Notes',
    onOpenNote = null,
    droppable = null,
    ribbonFor = null,
    draft = null,
    surfaceProps = null,
}) => {
    const geometry = useDayGeometry();

    // Recomputed whenever the day's notes change, and only then. Every ribbon
    // reads it, and it is a sort plus a scan — cheap, but not free on a drag
    // that re-renders the strip on every pointer move.
    const lanes = useMemo(() => assignLanes(notes), [notes]);

    return (
        <div
            // The droppable contributes its hover class, so the plane has to
            // compose rather than own its className.
            //
            // Keyed off the class rather than off `droppable`, because a
            // droppable with nothing to add is a real case — the wrapper may
            // only want the node ref — and `${undefined}` would put the literal
            // string "undefined" in the class list, where it would sit looking
            // like a rule somebody forgot to write.
            className={`note-plane${droppable?.className ? ` ${droppable.className}` : ''}`}
            role="group"
            aria-label={label}
            data-day-id={dayId}
            ref={droppable?.setNodeRef}
        >
            {/* The surface the create gesture is pressed on. A sibling behind
                the ribbons rather than the plane itself, so a press that lands
                on an existing note opens it instead of starting a new one —
                which is what the user meant by pressing on it. */}
            <div className="note-plane-surface" {...(surfaceProps ?? {})} />

            {notes.map((note) =>
                ribbonFor ? (
                    ribbonFor(note, lanes.get(note.id))
                ) : (
                    <NoteRibbon
                        key={note.id}
                        note={note}
                        lane={lanes.get(note.id)}
                        onOpen={onOpenNote}
                    />
                )
            )}

            {draft && (
                <div
                    className={`note-draft${draft.isAllowed ? '' : ' note-draft--refused'}`}
                    aria-hidden="true"
                    style={{
                        top: `${geometry.minutesToPx(draft.startMinutes)}px`,
                        height: `${geometry.minutesToPx(draft.durationMinutes)}px`,
                    }}
                />
            )}
        </div>
    );
};

export default NotePlane;
