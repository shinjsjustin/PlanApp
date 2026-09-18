import React, { useCallback, useMemo, useState } from 'react';

import NotePlane from './NotePlane';
import NotePopover from './NotePopover';
import NoteRibbon from './NoteRibbon';
import useNoteDraft from '../../hooks/useNoteDraft';
import useResizeEdge, { EDGE } from '../../hooks/useResizeEdge';
import { canPlace } from '../../lib/noteLanes';
import { DAY_MINUTES, MIN_DURATION } from '../../lib/schedule';
import { useDayGeometry } from '../../state/DayScaleContext';

// One day's notes plane with all of its gestures wired: press to create, click
// to open, drag an edge to resize, Delete in the popover.
//
// WHY THE GESTURES LIVE HERE and not above the strip, which is where the booking
// gestures had to go. A booking's bottom edge dragged past midnight spills into
// the next day, so React unmounts its card mid-drag and the gesture would die
// with it — `useResizeEdge`'s header records that at length. A note cannot leave
// its day (decision 8), so its ribbon is never unmounted by its own resize, and
// the gesture is safe one level down. That is worth taking: it keeps
// `CalendarDragArea` from growing a second gesture system beside the one it has.
//
// The popover is the one piece of state that is genuinely this layer's. Which
// note is open is a property of this column — clicking a ribbon in another one
// opens that column's popover and this one's outside-click closes ours.

/** A note being written but not yet saved: the range, and no row behind it. */
const NEW_NOTE = 'new';

const NoteLayer = ({
    dayId,
    label,
    notes,
    onCreate,
    onUpdate,
    onDelete,
    droppable = null,
    isDraggable = false,
}) => {
    const geometry = useDayGeometry();

    // Either `{ kind: NEW_NOTE, range }` or `{ kind: 'existing', note }`.
    const [open, setOpen] = useState(null);

    const close = useCallback(() => setOpen(null), []);

    /**
     * Whether this day has a free lane for a range — the live refusal behind both
     * the draft ghost and the resize preview.
     *
     * `id` is passed through so a note being resized is tested against its
     * siblings rather than against the row it is about to replace; a draft has no
     * id and is tested against everything.
     */
    const canPlaceAt = useCallback(
        (unusedDayId, range) => canPlace(notes, range),
        [notes]
    );

    const commitDraft = useCallback(
        (range) => setOpen({ kind: NEW_NOTE, range }),
        []
    );

    const { draft, startDraft } = useNoteDraft({
        geometry,
        canPlaceAt,
        onCommit: commitDraft,
    });

    const surfaceProps = useMemo(
        () => ({ onPointerDown: (event) => startDraft(dayId, event) }),
        [dayId, startDraft]
    );

    // ─── Resizing ──────────────────────────────────────────────────────────

    const [preview, setPreview] = useState(null);

    /**
     * What a pressed edge may do. Both edges resolve with a floor of 0: notes may
     * overlap, so a note's top edge has nothing above it to clamp against — the
     * asymmetry a booking has does not exist here.
     */
    const resolveEdge = useCallback(
        (noteId) => {
            const note = notes.find((other) => other.id === noteId);
            if (!note) return null;

            // `useResizeEdge` works on `{ startMinutes, durationMinutes }` and
            // keys its callbacks by whatever id it was handed, so a note is the
            // same shape to it as a booking.
            return { item: note, floor: 0 };
        },
        [notes]
    );

    /**
     * Holds a resized note inside its day (decision 8).
     *
     * `useResizeEdge` bounds a duration to at most a whole day but deliberately
     * does not stop it running past midnight — for a booking, overrunning is the
     * input to the spill. Notes have no spill, so the clamp belongs here, on the
     * one caller that needs it, rather than as a flag on the shared hook.
     *
     * Clamped rather than refused, because the gesture is unambiguous: dragging
     * the bottom edge downward at 23:00 plainly means "as long as it can be".
     */
    const holdInsideDay = useCallback(
        (rect) => ({
            startMinutes: rect.startMinutes,
            durationMinutes: Math.max(
                MIN_DURATION,
                Math.min(rect.durationMinutes, DAY_MINUTES - rect.startMinutes)
            ),
        }),
        []
    );

    const handlePreview = useCallback(
        (noteId, rect) => {
            const held = holdInsideDay(rect);

            // A refused preview is still drawn, in the refused style, so the
            // user sees the limit while the pointer is still down (section 8.4).
            setPreview({
                noteId,
                ...held,
                isAllowed: canPlace(notes, { id: noteId, ...held }),
            });
        },
        [holdInsideDay, notes]
    );

    const handleCommit = useCallback(
        (noteId, rect) => {
            const held = holdInsideDay(rect);

            setPreview(null);

            if (!canPlace(notes, { id: noteId, ...held })) return;

            onUpdate(noteId, held);
        },
        [holdInsideDay, notes, onUpdate]
    );

    const handleCancel = useCallback(() => setPreview(null), []);

    const { startResize } = useResizeEdge({
        geometry,
        resolve: resolveEdge,
        onPreview: handlePreview,
        onCommit: handleCommit,
        onCancel: handleCancel,
    });

    // The notes as they would be if the resize in flight were released. Drawn
    // instead of the real ones, so the ghost is the same arithmetic the save will
    // use rather than a separate "what it would look like".
    const shown = useMemo(() => {
        if (!preview) return notes;

        return notes.map((note) =>
            note.id === preview.noteId
                ? {
                      ...note,
                      startMinutes: preview.startMinutes,
                      durationMinutes: preview.durationMinutes,
                  }
                : note
        );
    }, [notes, preview]);

    // ─── The popover ──────────────────────────────────────────────────────────

    // A note open when its row goes — a failed save rolled it away, or a resync
    // answered — has nothing left to edit, so the popover closes rather than
    // saving into a hole.
    const openNote =
        open?.kind === NEW_NOTE
            ? null
            : notes.find((note) => note.id === open?.note.id) ?? null;

    const isPopoverOpen = open?.kind === NEW_NOTE || openNote !== null;

    const popoverRange = open?.kind === NEW_NOTE ? open.range : openNote;

    const save = useCallback(
        (text) => {
            if (open?.kind === NEW_NOTE) onCreate({ dayId, text, ...open.range });
            else onUpdate(openNote.id, { text });

            close();
        },
        [close, dayId, onCreate, onUpdate, open, openNote]
    );

    const remove = useCallback(() => {
        onDelete(openNote.id);
        close();
    }, [close, onDelete, openNote]);

    const openExisting = useCallback(
        (noteId) => {
            const note = notes.find((other) => other.id === noteId);

            if (note) setOpen({ kind: 'existing', note });
        },
        [notes]
    );

    return (
        <>
            <NotePlane
                dayId={dayId}
                label={label}
                notes={shown}
                droppable={droppable}
                draft={draft}
                surfaceProps={surfaceProps}
                ribbonFor={(note, lane) => (
                    <NoteRibbon
                        key={note.id}
                        note={note}
                        lane={lane}
                        onOpen={openExisting}
                        isDraggable={isDraggable}
                        resize={{
                            top: {
                                handleProps: {
                                    onPointerDown: (event) =>
                                        startResize(note.id, EDGE.top, event),
                                },
                            },
                            bottom: {
                                handleProps: {
                                    onPointerDown: (event) =>
                                        startResize(note.id, EDGE.bottom, event),
                                },
                            },
                        }}
                    />
                )}
            />

            {isPopoverOpen && (
                <NotePopover
                    range={popoverRange}
                    text={openNote?.text ?? ''}
                    onSave={save}
                    onCancel={close}
                    onDelete={openNote ? remove : null}
                    style={{ top: `${geometry.minutesToPx(popoverRange.startMinutes)}px` }}
                />
            )}
        </>
    );
};

export default NoteLayer;
