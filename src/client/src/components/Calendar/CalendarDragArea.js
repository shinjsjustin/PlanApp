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
import DayStrip from './DayStrip';
import ProjectPanel from './ProjectPanel';
import RemoveOverlay from './RemoveOverlay';
import { DEFAULT_DURATION, moveItem, placeFromPool } from '../../lib/schedule';
import { clampStart, pxToMinutes } from '../../lib/scheduleGeometry';
import { isTempId } from '../../lib/tempIds';
import { scheduleOf } from '../../state/calendarReducer';
import { useCalendarContext } from '../../state/CalendarContext';

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

const POINTER_SENSOR_OPTIONS = {
    activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE_PX },
};

export const DRAG_KIND = { pool: 'pool', booking: 'booking' };

/** What was lifted, read off the data the draggable carries. */
export const dragKindOf = (activeData) => {
    if (activeData?.poolTodo !== undefined) return DRAG_KIND.pool;
    if (activeData?.bookingTodoId !== undefined) return DRAG_KIND.booking;

    return null;
};

/**
 * The minute a card's top edge is over, snapped to the grid.
 *
 * The top edge rather than the pointer: it is the edge the user is lining up
 * against the rule, and for a booking being moved it is literally the value being
 * set. `getBoundingClientRect` already accounts for the column's inner scroll,
 * so no scroll offset is added here.
 */
export const minutesAtRect = (activeRect, gridRect) =>
    clampStart(pxToMinutes(activeRect.top - gridRect.top));

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

const CalendarDragArea = ({ pool, onOpenSource, expandedProjectIds, onToggleProject }) => {
    const { state, commit, unschedule, hasUnsavedDay } = useCalendarContext();

    const [active, setActive] = useState(null);
    const [preview, setPreview] = useState(null);

    // dayId → the element the grid is drawn in, for measuring a drop.
    const gridsRef = useRef(new Map());

    const registerGrid = useCallback((dayId, node) => {
        if (node) gridsRef.current.set(dayId, node);
        else gridsRef.current.delete(dayId);
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
                startMinutes: minutesAtRect(activeRect, grid.getBoundingClientRect()),
            };
        },
        []
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
        [commit, state, targetFrom, unschedule]
    );

    // Escape, and any cancel dnd-kit reports. The preview simply goes.
    const handleDragCancel = useCallback(() => {
        setActive(null);
        setPreview(null);
    }, []);

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
                            isDropDisabled={hasUnsavedDay}
                        />
                    )}
                />

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
        </DndContext>
    );
};

/** A day column with its droppable wired in. */
const DroppableDayColumn = ({ day, index, items, onOpenSource, registerGrid, isDropDisabled }) => {
    const droppable = useDayDroppable(day.id, registerGrid, isDropDisabled);

    return (
        <DayColumn
            day={day}
            index={index}
            items={items}
            onOpenSource={onOpenSource}
            droppable={droppable}
            isDraggable
        />
    );
};

const labelOf = (active) =>
    active.kind === DRAG_KIND.pool ? active.data.poolTodo.text : 'Moving…';

export default CalendarDragArea;
