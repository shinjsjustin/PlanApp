import React, { useCallback, useMemo, useState } from 'react';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    pointerWithin,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import useProjectMutations from '../../hooks/useProjectMutations';
import { resolveSequencePlacement, resolveTodoPlacement } from '../../lib/dragDrop';
import { DragProvider } from '../../state/DragContext';
import { useProjectContext } from '../../state/ProjectContext';

// The drag-and-drop wiring for the whole project body (spec section 4.7).
//
// It wraps the unorganized panel and the canvas together, because a drag starts
// in one and ends in the other. All it does is turn a drop into a placement and
// hand that to `moveTodo` or `moveSequence`, depending on what was lifted: the
// same optimistic path, the same endpoint, and the same rollback-and-toast on
// failure as the menu actions use. Nothing about a drag reaches the reducer — a
// drag in progress has changed nothing yet.
//
// What each drop *means* is worked out in `lib/dragDrop`, as pure functions over
// the graph, so the rules are tested without a layout jsdom cannot provide.

/**
 * How far the pointer must travel before a press becomes a drag. Without it a
 * plain click on a to-do's status control or its menu would be swallowed by the
 * drag sensor and never reach the button.
 */
const POINTER_ACTIVATION_DISTANCE_PX = 5;

/**
 * Built once rather than per render: `useSensor` memoises on the options object
 * by identity, so a fresh literal each time would rebuild the sensor list and
 * its activator listeners on every render of a tree that re-renders on every
 * graph change.
 */
const POINTER_SENSOR_OPTIONS = {
    activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE_PX },
};

// The whole thing is operable without a mouse: the handle lifts on Space or
// Enter, arrows move, Space or Enter drops, Escape cancels.
const KEYBOARD_SENSOR_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

/** What a lift turned out to be, decided from the data the draggable carried. */
const DRAG_KIND = { todo: 'todo', sequence: 'sequence' };

/**
 * Droppables nest here — the gaps between to-dos sit inside the card body that
 * accepts a drop of its own — so the pointer's own position decides first, and
 * only when it is over nothing does the nearest droppable win. That fallback is
 * also what the keyboard sensor runs on, having no pointer to speak of.
 */
const detectCollisions = (args) => {
    const under = pointerWithin(args);

    return under.length > 0 ? under : closestCenter(args);
};

const DragDropArea = ({ children }) => {
    const { state } = useProjectContext();
    const { moveTodo, moveSequence } = useProjectMutations();
    // What is in the air, as `{ kind, id }`, or null. One piece of state rather
    // than two, because exactly one thing is ever being dragged.
    const [active, setActive] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
        useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS)
    );

    /**
     * What is being dragged, looked up in the graph. Both are exposed through
     * one context value so a card can ask either question without the provider
     * changing identity on every unrelated render.
     */
    const dragging = useMemo(
        () => ({
            activeTodo: active?.kind === DRAG_KIND.todo ? state.todos[active.id] ?? null : null,
            activeSequence:
                active?.kind === DRAG_KIND.sequence ? state.sequences[active.id] ?? null : null,
        }),
        [active, state.todos, state.sequences]
    );

    const handleDragStart = useCallback((event) => {
        const data = event.active.data.current;

        if (data?.todoId !== undefined) {
            setActive({ kind: DRAG_KIND.todo, id: data.todoId });
            return;
        }

        if (data?.sequenceId !== undefined) {
            setActive({ kind: DRAG_KIND.sequence, id: data.sequenceId });
            return;
        }

        setActive(null);
    }, []);

    /**
     * A drop the rules refuse — a to-do let go over another sequence, or over
     * the unorganized panel — resolves to no placement and so sends nothing.
     * That is not a silent failure: the card said it would not take it for the
     * whole drag, which is why the drop reached it saying so.
     *
     * A sequence drop is refused for one reason only: it landed where it already
     * was. Every layer takes every sequence, and what a move costs in edges is
     * settled by the cascade rather than by refusing the drop.
     */
    const handleDragEnd = useCallback(
        (event) => {
            setActive(null);

            const data = event.active.data.current;
            const target = event.over?.data.current?.dropTarget ?? null;

            if (data?.todoId !== undefined) {
                const lifted = state.todos[data.todoId];
                if (!lifted) return;

                const placement = resolveTodoPlacement({
                    activeTodo: lifted,
                    target,
                    todos: Object.values(state.todos),
                });

                if (placement) moveTodo(lifted.id, placement);
                return;
            }

            if (data?.sequenceId !== undefined) {
                const lifted = state.sequences[data.sequenceId];
                if (!lifted) return;

                const placement = resolveSequencePlacement({
                    activeSequence: lifted,
                    target,
                    sequences: Object.values(state.sequences),
                });

                if (placement) moveSequence(lifted.id, placement);
            }
        },
        [moveTodo, moveSequence, state.todos, state.sequences]
    );

    const handleDragCancel = useCallback(() => setActive(null), []);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={detectCollisions}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <DragProvider value={dragging}>{children}</DragProvider>
        </DndContext>
    );
};

export default DragDropArea;
