// What a drop means (spec section 4.7).
//
// `@dnd-kit` answers one question — which droppable did this pointer or keypress
// end on. Everything after that is arithmetic over the graph, so it lives here
// as pure functions rather than inside the drag handler: no React, no DOM, no
// measurement, and so testable without a layout jsdom cannot provide.
//
// The v1 rules, narrower than the library would allow on its own:
//
//   - A to-do waiting in the unorganized panel may be filed into any sequence.
//   - A to-do already in a sequence may only be reordered inside that same
//     sequence. Dragging one to a different sequence is out of scope (spec 2).
//   - Nothing may be dragged back to the unorganized panel; that is the per-item
//     menu action, not a drag (spec 2).

import { sortByPosition } from './graph';

/**
 * The three droppables a drop can end on. `gap` and `item` both name an index,
 * but they count differently for a reorder — see `positionWithinList`.
 */
export const DROP_TARGET = {
    /** A sequence card body: the to-do goes to the end of its list. */
    append: 'append',
    /** A `DropZone` between two to-dos: the to-do goes at that index. */
    gap: 'gap',
    /** Another to-do, which the sortable preset registers as a droppable too. */
    item: 'item',
};

/**
 * Whether `activeTodo` may be dropped into the list named by `targetSequenceId`,
 * where null is the unorganized panel.
 *
 * This is what the cards consult while a drag is in flight, so an ineligible
 * target can say so before the drop rather than swallowing it silently.
 */
export const isEligibleDropTarget = (activeTodo, targetSequenceId) => {
    if (!activeTodo) return false;
    if (targetSequenceId === null || targetSequenceId === undefined) return false;
    if (activeTodo.sequenceId === null) return true;

    return activeTodo.sequenceId === targetSequenceId;
};

const listOf = (todos, sequenceId) =>
    sortByPosition(todos.filter((todo) => todo.sequenceId === sequenceId));

/**
 * The index a to-do joining a list it is not already in should take.
 *
 * The list does not contain it, so a gap index and a to-do's index both mean
 * "go here, and push everything from here down" — the same thing the server's
 * `insertAt` does. Appending puts it after everything already there.
 */
const positionJoiningList = (target, list) =>
    target.kind === DROP_TARGET.append ? list.length : target.index;

/**
 * The index a to-do already in the list should end up at, counted the way both
 * the sortable preset and the server's `moveItem` count it: the index in the
 * list once the to-do has been lifted out of it.
 *
 * A gap index is read off the list as displayed, which still holds the to-do, so
 * a gap below where it started is one too high. An index over another to-do
 * already means "take that to-do's place", which needs no adjustment.
 */
const positionWithinList = (target, list, from) => {
    if (target.kind === DROP_TARGET.append) return list.length - 1;
    if (target.kind === DROP_TARGET.item) return target.index;

    return target.index > from ? target.index - 1 : target.index;
};

/**
 * The move a drop asks for, shaped as the body `PUT /api/todos/:id/move` takes,
 * or null when it asks for nothing: the target refuses this to-do, or the to-do
 * was let go where it already was.
 *
 * `todos` is the project's to-dos as a plain array — the same shape the graph
 * hands out. Null rather than a throw, because a drop landing somewhere it
 * cannot go is an ordinary gesture, not a fault.
 */
export const resolveTodoPlacement = ({ activeTodo, target, todos }) => {
    if (!target || !isEligibleDropTarget(activeTodo, target.sequenceId)) return null;

    const list = listOf(todos, target.sequenceId);

    if (activeTodo.sequenceId !== target.sequenceId) {
        return { sequenceId: target.sequenceId, position: positionJoiningList(target, list) };
    }

    const from = list.findIndex((todo) => todo.id === activeTodo.id);
    const position = positionWithinList(target, list, from);

    if (position === from) return null;

    return { sequenceId: target.sequenceId, position };
};
