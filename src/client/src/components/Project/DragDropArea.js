import React, { useCallback, useState } from 'react';
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
import { resolveTodoPlacement } from '../../lib/dragDrop';
import { DragProvider } from '../../state/DragContext';
import { useProjectContext } from '../../state/ProjectContext';

// The drag-and-drop wiring for the whole project body (spec section 4.7).
//
// It wraps the unorganized panel and the canvas together, because a drag starts
// in one and ends in the other. All it does is turn a drop into a placement and
// hand that to `moveTodo`: the same optimistic path, the same endpoint, and the
// same rollback-and-toast on failure as the menu action uses. Nothing about a
// drag reaches the reducer — a drag in progress has changed nothing yet.
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
    const { moveTodo } = useProjectMutations();
    const [activeTodoId, setActiveTodoId] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
        useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS)
    );

    const todoOf = useCallback(
        (id) => (id === null || id === undefined ? null : state.todos[id] ?? null),
        [state.todos]
    );

    const activeTodo = todoOf(activeTodoId);

    const handleDragStart = useCallback((event) => {
        setActiveTodoId(event.active.data.current?.todoId ?? null);
    }, []);

    /**
     * A drop the rules refuse — a to-do let go over another sequence, or over
     * the unorganized panel — resolves to no placement and so sends nothing.
     * That is not a silent failure: the card said it would not take it for the
     * whole drag, which is why the drop reached it saying so.
     */
    const handleDragEnd = useCallback(
        (event) => {
            setActiveTodoId(null);

            const lifted = todoOf(event.active.data.current?.todoId);
            if (!lifted) return;

            const placement = resolveTodoPlacement({
                activeTodo: lifted,
                target: event.over?.data.current?.dropTarget ?? null,
                todos: Object.values(state.todos),
            });

            if (placement) moveTodo(lifted.id, placement);
        },
        [moveTodo, state.todos, todoOf]
    );

    const handleDragCancel = useCallback(() => setActiveTodoId(null), []);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={detectCollisions}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <DragProvider activeTodo={activeTodo}>{children}</DragProvider>
        </DndContext>
    );
};

export default DragDropArea;
