import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';

import DayColumn from './DayColumn';
import DayItemCard from './DayItemCard';
import DayStrip from './DayStrip';
import NoteLayer from './NoteLayer';
import ProjectPanel from './ProjectPanel';
import RemoveOverlay from './RemoveOverlay';
import useDayScale from '../../hooks/useDayScale';
import useResizeEdge, { EDGE } from '../../hooks/useResizeEdge';
import {
    DAY_MINUTES,
    DEFAULT_DURATION,
    moveItem,
    placeFromPool,
    resizeItem,
    topEdgeFloor,
} from '../../lib/schedule';
import { clampStart } from '../../lib/scheduleGeometry';
import { isTempId } from '../../lib/tempIds';
import { scheduleOf } from '../../state/calendarReducer';
import { useCalendarContext } from '../../state/CalendarContext';
import { DayScaleProvider } from '../../state/DayScaleContext';

// Everything that can be dragged on this page, and what a drop means.
//
// Two things are dragged and they end in the same place: a row from the pool,
// which has no booking yet, and a booking already in a day. `lib/schedule` tells
// them apart — `placeFromPool` refuses a to-do that is already booked, `moveItem`
// refuses one that is not — so this file only has to say which is which.
//
// A day column is ONE droppable rather than one per half-hour slot. The minute
// comes from where the dragged card's top edge actually is, measured against the
// column's grid. Forty-eight droppables a day would be hundreds across a strip,
// and would snap to a slot's centre rather than its edge, so a card would never
// line up with the rule the user aimed at.
//
// The preview is the real thing. Every pointer move recomputes the whole settled
// schedule with the same function that will be saved on release, and the strip
// renders from that. There is no separate "what it would look like" code to drift
// from what actually happens.
//
// Nothing reaches the reducer until the drop: a drag in progress has changed
// nothing, and Escape or a release over nothing leaves the calendar as it was.

const POINTER_ACTIVATION_DISTANCE_PX = 5;

/** The bottom edge has no floor: it may run past midnight, and the spill sorts it. */
const NO_FLOOR = 0;

const POINTER_SENSOR_OPTIONS = {
    activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE_PX },
};

export const DRAG_KIND = { pool: 'pool', booking: 'booking', note: 'note' };

/** What was lifted, read off the data the draggable carries. */
export const dragKindOf = (activeData) => {
    if (activeData?.poolTodo !== undefined) return DRAG_KIND.pool;
    if (activeData?.bookingTodoId !== undefined) return DRAG_KIND.booking;
    if (activeData?.noteId !== undefined) return DRAG_KIND.note;

    return null;
};

/**
 * The minute a card's top edge is over, snapped to the grid.
 *
 * The top edge rather than the pointer: it is the edge the user is lining up
 * against the rule, and for a booking being moved it is literally the value being
 * set. `getBoundingClientRect` already accounts for the column's inner scroll,
 * so no scroll offset is added here.
 *
 * `geometry` is the live scale — the column is no longer a fixed 24px a slot, so
 * how many minutes a pixel offset is worth depends on how tall the window let
 * the column be.
 */
export const minutesAtRect = (geometry, activeRect, gridRect) =>
    clampStart(geometry.pxToMinutes(activeRect.top - gridRect.top));

/**
 * The schedule as it would be if the drag were released now. Null target — the
 * pointer is over no column — previews nothing and returns the input unchanged.
 */
export const previewFor = (schedule, target) => {
    if (!target) return schedule;

    const { kind, todo, dayId, startMinutes } = target;

    return kind === DRAG_KIND.pool
        ? placeFromPool(schedule, {
              ...todo,
              dayId,
              startMinutes,
              durationMinutes: DEFAULT_DURATION,
          })
        : moveItem(schedule, { todoId: todo.todoId, dayId, startMinutes });
};

/**
 * What moving a note to a drop target would change, or null when it would change
 * nothing legal.
 *
 * Deliberately not a preview. A booking's drop is previewed because it cascades
 * — half a day moves with it, and the only way to show that truthfully is to
 * compute the whole settled schedule. A note moves alone (decision 1), so the
 * dnd overlay under the pointer is already an honest picture of the result and
 * there is nothing else to draw.
 *
 * A drop that would push the note past midnight is refused rather than clamped.
 * Clamping would silently save a different note from the one the gesture
 * described, and a note at 23:00 dropped where it cannot fit is a miss, not a
 * request to shorten it.
 */
export const noteMoveFor = (note, target) => {
    if (!target) return null;

    const { dayId, startMinutes } = target;

    if (dayId === note.dayId && startMinutes === note.startMinutes) return null;
    if (startMinutes + note.durationMinutes > DAY_MINUTES) return null;

    return { dayId, startMinutes };
};

/**
 * Re-uses the previous frame's temporary day ids for this frame's.
 *
 * A preview is recomputed from scratch on every pointer move, and a drag near
 * the bottom of the last day spills — so `spillFrom` mints a *fresh* negative id
 * each time. Those ids are React keys: without this, the appended column would
 * unmount and remount on every frame of the drag, losing its scroll position and
 * flickering, and the id counter would run away for the length of the gesture.
 *
 * Temporary days are only ever appended, in order, so matching them up by
 * position is exact. Days the server has already saved are left alone.
 */
export const withStableTempDays = (previousPreview, next) => {
    if (!previousPreview) return next;

    const before = previousPreview.days.filter((day) => isTempId(day.id)).map((day) => day.id);
    const after = next.days.filter((day) => isTempId(day.id)).map((day) => day.id);

    const remap = new Map(
        after.slice(0, before.length).map((id, index) => [id, before[index]])
    );

    if (remap.size === 0) return next;

    return {
        ...next,
        days: next.days.map((day) =>
            remap.has(day.id) ? { ...day, id: remap.get(day.id) } : day
        ),
        items: next.items.map((item) =>
            remap.has(item.dayId) ? { ...item, dayId: remap.get(item.dayId) } : item
        ),
    };
};

/**
 * A day column's droppable wiring, plus the ref the geometry is measured from.
 *
 * Disabled while any day is still waiting for its real id: a booking dropped
 * then would name an id the server has never heard of, and the save would die
 * mid-gesture with nothing on screen to explain it. The wait is one round trip,
 * the same one the strip's + waits out.
 *
 * A day that exists only in *this* drag's preview is the other half of the same
 * question, and the gate covers both: the spill mints it as the pointer moves,
 * so the committed schedule every handler settles against has never heard of it
 * either, and `spillFrom` would throw straight out of the drop handler where no
 * error boundary can catch it. Temporary ids are what both cases have in common.
 */
const useDayDroppable = (dayId, registerGrid, isDisabled) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `day-${dayId}`,
        disabled: isDisabled,
        data: { dropTarget: { dayId } },
    });

    const ref = useCallback(
        (node) => {
            setNodeRef(node);
            registerGrid(dayId, node);
        },
        [dayId, setNodeRef, registerGrid]
    );

    return {
        setNodeRef: ref,
        className: `day-column-drop${isOver ? ' day-column-drop--over' : ''}`,
    };
};

/**
 * The notes plane's droppable.
 *
 * A second target per column rather than one shared with the bookings, because
 * the two planes must not catch each other's drags: a to-do released over the
 * notes half would otherwise book itself, and a note released over the to-do
 * half would jump the boundary. Each is disabled while the other kind is in the
 * air, which is also what stops `pointerWithin` having to choose between two
 * overlapping targets.
 */
const useNoteDroppable = (dayId, registerPlane, isDisabled) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `notes-${dayId}`,
        disabled: isDisabled,
        data: { noteDropTarget: { dayId } },
    });

    const ref = useCallback(
        (node) => {
            setNodeRef(node);
            registerPlane(dayId, node);
        },
        [dayId, setNodeRef, registerPlane]
    );

    return {
        setNodeRef: ref,
        className: `note-plane-drop${isOver ? ' note-plane-drop--over' : ''}`,
    };
};

const CalendarDragArea = ({ pool, notes, onOpenSource, expandedProjectIds, onToggleProject }) => {
    const { state, commit, unschedule, hasUnsavedDay } = useCalendarContext();

    const [active, setActive] = useState(null);
    const [preview, setPreview] = useState(null);

    // The scale every column, card and ribbon draws at. Held here rather than on
    // the page because this is the component that renders the strip, and the
    // columns that register their viewports are its children.
    const { geometry, registerViewport } = useDayScale();

    // dayId → the element the grid is drawn in, for measuring a drop.
    const gridsRef = useRef(new Map());

    const registerGrid = useCallback((dayId, node) => {
        if (node) gridsRef.current.set(dayId, node);
        else gridsRef.current.delete(dayId);
    }, []);

    // dayId → the notes plane element, for measuring a note drop.
    const planesRef = useRef(new Map());

    const registerPlane = useCallback((dayId, node) => {
        if (node) planesRef.current.set(dayId, node);
        else planesRef.current.delete(dayId);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
        useSensor(KeyboardSensor)
    );

    const shown = preview ?? scheduleOf(state);

    // Keyed on the two collections rather than on `shown`, and that is the whole
    // point of the dependency list here: `scheduleOf` returns a fresh wrapper on
    // every call, so depending on the wrapper would rebuild this map — a
    // `findIndex` per item — on every render, which is every render with no drag
    // in flight. The arrays inside it are the references the reducer and
    // `lib/schedule` both work to preserve, so they say what actually moved.
    const scheduledByTodoId = useMemo(
        () =>
            new Map(
                shown.items.flatMap((item) => {
                    const dayIndex = shown.days.findIndex((day) => day.id === item.dayId);

                    // An item can name a day this payload never drew. As far as
                    // anything on screen is concerned it is not scheduled.
                    return dayIndex === -1 ? [] : [[item.todoId, { dayIndex }]];
                })
            ),
        [shown.days, shown.items]
    );

    /** What the drop would be, from the event, or null when it is over nothing. */
    const targetFrom = useCallback(
        (event) => {
            const data = event.active.data.current;
            const kind = dragKindOf(data);
            const dropTarget = event.over?.data.current?.dropTarget ?? null;

            if (!kind || !dropTarget || dropTarget.dayId === undefined) return null;

            const grid = gridsRef.current.get(dropTarget.dayId);
            const activeRect = event.active.rect.current.translated;

            if (!grid || !activeRect) return null;

            return {
                kind,
                todo: kind === DRAG_KIND.pool ? data.poolTodo : { todoId: data.bookingTodoId },
                dayId: dropTarget.dayId,
                startMinutes: minutesAtRect(geometry, activeRect, grid.getBoundingClientRect()),
            };
        },
        [geometry]
    );

    /** Where a note drag would land, or null when it is over no plane. */
    const noteTargetFrom = useCallback(
        (event) => {
            const dropTarget = event.over?.data.current?.noteDropTarget ?? null;
            if (!dropTarget) return null;

            const plane = planesRef.current.get(dropTarget.dayId);
            const activeRect = event.active.rect.current.translated;

            if (!plane || !activeRect) return null;

            return {
                dayId: dropTarget.dayId,
                startMinutes: minutesAtRect(
                    geometry,
                    activeRect,
                    plane.getBoundingClientRect()
                ),
            };
        },
        [geometry]
    );

    const handleDragStart = useCallback((event) => {
        const data = event.active.data.current;

        setActive({ kind: dragKindOf(data), data });
    }, []);

    // A gesture aimed at something impossible — a pool row for a to-do that is
    // somehow already booked — makes `lib/schedule` throw, by design. On a
    // pointer-move handler that would tear down the whole page mid-drag, so it is
    // reported and the last good preview is held instead. Not swallowed: it
    // reaches the console with its cause, and the drop below re-runs the same
    // call, where a genuine failure surfaces as a rolled-back mutation.
    const handleDragMove = useCallback(
        (event) => {
            const target = targetFrom(event);

            if (!target) {
                setPreview(null);
                return;
            }

            setPreview((current) => {
                try {
                    return withStableTempDays(current, previewFor(scheduleOf(state), target));
                } catch (err) {
                    console.error('Could not preview this drop:', err);
                    return current;
                }
            });
        },
        [state, targetFrom]
    );

    /**
     * A release over the remove overlay unschedules; over a column, commits the
     * preview; over nothing, does nothing at all. That last one is the "drag it
     * back and let go" cancel — it is not a failure and says nothing.
     */
    const handleDragEnd = useCallback(
        (event) => {
            const dropTarget = event.over?.data.current?.dropTarget ?? null;
            const data = event.active.data.current;

            setActive(null);
            setPreview(null);

            if (dragKindOf(data) === DRAG_KIND.note) {
                const note = notes.state.notes.find((other) => other.id === data.noteId);
                const move = note && noteMoveFor(note, noteTargetFrom(event));

                // A drop over nothing, back where it started, or somewhere it
                // will not fit: the gesture simply ends. Not a failure, so
                // nothing is said.
                if (move) notes.updateNote(note.id, move);

                return;
            }

            if (dropTarget?.remove && dragKindOf(data) === DRAG_KIND.booking) {
                unschedule(data.bookingTodoId);
                return;
            }

            const target = targetFrom(event);
            if (!target) return;

            // Unguarded on purpose, unlike the move handler: a drop is a single
            // event, and a gesture that cannot be computed is a wiring bug that
            // should be loud rather than silently doing nothing.
            commit(previewFor(scheduleOf(state), target));
        },
        [commit, noteTargetFrom, notes, state, targetFrom, unschedule]
    );

    // Escape, and any cancel dnd-kit reports. The preview simply goes.
    const handleDragCancel = useCallback(() => {
        setActive(null);
        setPreview(null);
    }, []);

    // The three below are the resize gesture's half of the same preview-then-commit
    // shape. `resizeItem` runs `spillFrom` itself, so a booking dragged past
    // midnight spills as the user drags and is saved as one bulk request.
    //
    // Guarded for the same reason `handleDragMove` is, and reached the same way:
    // the booking the press resolved against can leave the committed schedule
    // mid-gesture — a failed save rolls it back, or a resync answers — and
    // `resizeItem` then throws for a to-do that is no longer booked. From inside
    // a state updater that throw is rethrown during render, where there is no
    // boundary above it.
    const handleResizePreview = useCallback(
        (todoId, rect) => {
            setPreview((current) => {
                try {
                    return withStableTempDays(
                        current,
                        resizeItem(scheduleOf(state), { todoId, ...rect })
                    );
                } catch (err) {
                    console.error('Could not preview this resize:', err);
                    return current;
                }
            });
        },
        [state]
    );

    // The release has the same exposure and not a drop's: it runs from a raw
    // `document` pointerup listener, so a throw escapes the gesture entirely
    // rather than surfacing as a rolled-back mutation. There is nothing to save
    // for a booking that is no longer there, and the reason reaches the console.
    //
    // Only the gesture's own arithmetic is guarded. `commit` throws on a
    // schedule holding an unnamed day, and `useCalendar` leaves that one to
    // escape on purpose.
    const handleResizeCommit = useCallback(
        (todoId, rect) => {
            setPreview(null);

            let next;

            try {
                next = resizeItem(scheduleOf(state), { todoId, ...rect });
            } catch (err) {
                console.error('Could not save this resize:', err);
                return;
            }

            commit(next);
        },
        [commit, state]
    );

    const handleResizeCancel = useCallback(() => setPreview(null), []);

    // The schedule as it is *saved*, which is what the edges measure against —
    // see `ResizableDayItemCard` for why it is not `shown`.
    const committed = useMemo(() => scheduleOf(state), [state]);

    // What the pressed edge is allowed to do, read off the committed schedule at
    // the moment of the press. A to-do with no booking has no rectangle to
    // resize, and the press is ignored.
    //
    // So is every press while a day is still waiting for its real id, which is
    // the same gate the day columns apply to drops. A resize that spills leaves
    // a temporary day behind it, and `handleResizeCommit` is reached from a raw
    // `document` pointerup listener: a second edge dragged inside that round trip
    // would hand `toBulkRequest` a previous state it refuses, and the throw would
    // land further from a boundary than a drop's does.
    const resolveEdge = useCallback(
        (todoId, edge) => {
            if (hasUnsavedDay) return null;

            const booked = committed.items.find((item) => item.todoId === todoId);
            if (!booked) return null;

            return {
                item: booked,
                floor: edge === EDGE.top ? topEdgeFloor(committed, todoId) : NO_FLOOR,
            };
        },
        [committed, hasUnsavedDay]
    );

    const { startResize } = useResizeEdge({
        geometry,
        resolve: resolveEdge,
        onPreview: handleResizePreview,
        onCommit: handleResizeCommit,
        onCancel: handleResizeCancel,
    });

    const resize = useMemo(
        () => ({ schedule: committed, startResize }),
        [committed, startResize]
    );

    const isDraggingBooking = active?.kind === DRAG_KIND.booking;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <DayScaleProvider value={geometry}>
                <div className="calendar-body">
                    <DayStrip
                        schedule={shown}
                        onOpenSource={onOpenSource}
                        columnFor={(day, index, items) => (
                            <DroppableDayColumn
                                key={day.id}
                                day={day}
                                index={index}
                                items={items}
                                onOpenSource={onOpenSource}
                                registerGrid={registerGrid}
                                registerPlane={registerPlane}
                                registerViewport={registerViewport}
                                activeKind={active?.kind ?? null}
                                isDropDisabled={hasUnsavedDay || isTempId(day.id)}
                                resize={resize}
                                notes={notes}
                            />
                        )}
                    />

                    {/* A failed notes read sits above the strip rather than replacing
                        it: the days and their bookings are fine, and only the context
                        is missing. The same shape `pool-notice` already has. */}
                    <div className="notes-notice" role="alert" hidden={!notes.state.loadError}>
                        <p>{notes.state.loadError}</p>
                        <button type="button" onClick={notes.reload}>
                            Try again
                        </button>
                    </div>

                    <ProjectPanel
                        pool={pool}
                        scheduledByTodoId={scheduledByTodoId}
                        dragFor={(todo) => !scheduledByTodoId.has(todo.todoId)}
                        overlay={<RemoveOverlay isActive={isDraggingBooking} />}
                        expandedProjectIds={expandedProjectIds}
                        onToggleProject={onToggleProject}
                    />
                </div>

                {/* The thing under the pointer. The preview shows where everything
                    lands; this shows what is in the hand. */}
                <DragOverlay dropAnimation={null}>
                    {active && <div className="calendar-drag-ghost">{labelOf(active)}</div>}
                </DragOverlay>
            </DayScaleProvider>
        </DndContext>
    );
};

/** A day column with its droppable wired in, and cards that can be resized. */
const DroppableDayColumn = ({
    day,
    index,
    items,
    onOpenSource,
    registerGrid,
    registerPlane,
    registerViewport,
    activeKind,
    isDropDisabled,
    resize,
    notes,
}) => {
    const isNoteDrag = activeKind === DRAG_KIND.note;

    const droppable = useDayDroppable(day.id, registerGrid, isDropDisabled || isNoteDrag);
    const noteDroppable = useNoteDroppable(
        day.id,
        registerPlane,
        isDropDisabled || !isNoteDrag
    );

    return (
        <DayColumn
            day={day}
            index={index}
            items={items}
            onOpenSource={onOpenSource}
            droppable={droppable}
            registerViewport={registerViewport}
            notePlane={
                <NoteLayer
                    dayId={day.id}
                    label={`Notes for Day ${index + 1}`}
                    notes={notes.notesForDay(day.id)}
                    onCreate={notes.createNote}
                    onUpdate={notes.updateNote}
                    onDelete={notes.deleteNote}
                    droppable={noteDroppable}
                    isDraggable
                />
            }
            cardFor={(item) => (
                <ResizableDayItemCard
                    key={item.todoId}
                    item={item}
                    onOpenSource={onOpenSource}
                    {...resize}
                />
            )}
        />
    );
};

/**
 * One booking with both of its edges wired.
 *
 * The edges only *report* the press — the gesture itself belongs to
 * `CalendarDragArea`, because a resize that spills unmounts this card mid-drag
 * and would take its own gesture down with it (see `useResizeEdge`).
 *
 * The edges measure against the *committed* booking while the card draws the
 * shown one, and that split is what keeps a resize from compounding: every
 * frame's delta is measured from where the pointer went down, so feeding back a
 * rectangle the previous frame already moved would read 30 minutes of travel as
 * 60. The committed schedule does not change until release, so it is the stable
 * thing to measure against — the same reason the drag previews from
 * `scheduleOf(state)` rather than from the last preview.
 */
const ResizableDayItemCard = ({ item, schedule, onOpenSource, startResize }) => {
    const { completeTodo } = useCalendarContext();

    // An item on screen that the saved schedule has never heard of is a pool row
    // inside a drag preview. There is no booking to resize yet, so the edges are
    // left off rather than pointed at one that does not exist.
    const isBooked = schedule.items.some((other) => other.todoId === item.todoId);

    const edgeProps = (edge) => ({
        handleProps: {
            onPointerDown: (event) => startResize(item.todoId, edge, event),
        },
    });

    return (
        <DayItemCard
            item={item}
            onComplete={completeTodo}
            onOpenSource={onOpenSource}
            isDraggable
            resize={isBooked ? { top: edgeProps(EDGE.top), bottom: edgeProps(EDGE.bottom) } : null}
        />
    );
};

const labelOf = (active) => {
    if (active.kind === DRAG_KIND.pool) return active.data.poolTodo.text;
    if (active.kind === DRAG_KIND.note) return 'Moving note…';

    return 'Moving…';
};

export default CalendarDragArea;
