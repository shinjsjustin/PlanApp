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
import {
    DRAG_KIND,
    dragKindOf,
    dropTargetKindOf,
    resolveSequencePlacement,
    resolveTodoPlacement,
} from '../../lib/dragDrop';
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

/**
 * Which droppable a drop lands on.
 *
 * The droppables of the two drags are interleaved — a to-do row and the gaps
 * around it sit inside a sequence card that is itself somewhere another card can
 * be dropped — so the candidates are first narrowed to the ones belonging to the
 * drag actually in flight. Without that a nested to-do row would win a sequence
 * drag on distance alone, and the card would swallow a to-do let go on its
 * header: either drop resolves to a target of the wrong kind, and so to nothing
 * at all.
 *
 * Among what is left the pointer's own position decides first, and only when it
 * is over nothing does the nearest droppable win. That fallback is also what the
 * keyboard sensor runs on, having no pointer to speak of.
 */
export const detectCollisions = (args) => {
    const kind = dragKindOf(args.active?.data.current);
    const scoped = {
        ...args,
        droppableContainers: args.droppableContainers.filter(
            (container) => dropTargetKindOf(container.data.current?.dropTarget) === kind
        ),
    };

    const under = pointerWithin(scoped);

    return under.length > 0 ? under : closestCenter(scoped);
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

        switch (dragKindOf(data)) {
            case DRAG_KIND.todo:
                setActive({ kind: DRAG_KIND.todo, id: data.todoId });
                break;
            case DRAG_KIND.sequence:
                setActive({ kind: DRAG_KIND.sequence, id: data.sequenceId });
                break;
            default:
                setActive(null);
        }
    }, []);

    /**
     * A drop the rules refuse — a to-do let go over another sequence, or over
     * the unorganized panel — resolves to no placement and so sends nothing.
     * That is not a silent failure: the card said it would not take it for the
     * whole drag, which is why the drop reached it saying so.
     *
     * A sequence drop is refused for one reason only: it landed where it already
     * was. Every layer takes every sequence, so there is nothing else to refuse.
     */
    const handleDragEnd = useCallback(
        (event) => {
            setActive(null);

            const data = event.active.data.current;
            const target = event.over?.data.current?.dropTarget ?? null;

            if (dragKindOf(data) === DRAG_KIND.todo) {
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

            if (dragKindOf(data) === DRAG_KIND.sequence) {
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
