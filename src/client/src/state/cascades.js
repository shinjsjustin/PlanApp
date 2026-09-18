// What else changes when a layer or a sequence is added or deleted.
//
// The server does more than the one row a mutation names: positions stay dense
// 0..n-1, deleting a sequence returns its to-dos to the unorganized panel, and
// deleting a layer takes its sequences with it. An
// optimistic update that only moved the named row would leave the canvas
// disagreeing with the database until the next reload, so these functions work
// out the same moves and hand them back as reducer actions.
//
// Everything here is a pure function of the state it is given. It reads that
// state and returns new action objects; it never writes to it.

import { sortByPosition } from '../lib/graph';
import { entityRemoved, entityUpdated } from './projectActions';

const layersOf = (state) => sortByPosition(Object.values(state.layers));

const sequencesIn = (state, layerId) =>
    sortByPosition(Object.values(state.sequences).filter((s) => s.layerId === layerId));

const todosIn = (state, sequenceId) =>
    sortByPosition(Object.values(state.todos).filter((t) => t.sequenceId === sequenceId));

const unorganizedCount = (state) =>
    Object.values(state.todos).filter((todo) => todo.sequenceId === null).length;

/**
 * Cascading from an entity that is not in the state is a bug in the caller, not
 * something to quietly produce no actions for — that would look like a mutation
 * that succeeded and changed nothing.
 */
const requireEntity = (state, collection, id) => {
    const entity = state[collection][id];

    if (entity === undefined) {
        throw new Error(`No ${collection} entity with id ${id} to cascade from`);
    }

    return entity;
};

/** Shifts everything after `position` up by one, closing the gap left behind. */
const closeGap = (collection, items, position) =>
    items
        .filter((item) => item.position > position)
        .map((item) => entityUpdated(collection, item.id, { position: item.position - 1 }));

/**
 * Shifts everything from `index` down by one, opening a slot at it. Inserting at
 * the end of a list shifts nothing, which falls out of the filter rather than
 * needing a case of its own.
 */
const makeRoom = (collection, items, index) =>
    items
        .filter((item) => item.position >= index)
        .map((item) => entityUpdated(collection, item.id, { position: item.position + 1 }));

/**
 * Shifts the items a reordered one passed over, by one, in the direction it
 * travelled. `from` is where it sat; `to` is the index it lands on once it has
 * been lifted out of the list — the same index the server's `moveItem`
 * reindexes to, so both ends agree on what `position` means for a reorder.
 *
 * The moved item's own row is not in the range either way, so the caller's
 * `entityUpdated` for it is the only thing that sets its new position.
 */
const shiftPassedOver = (collection, items, from, to) => {
    if (to === from) return [];

    const [first, last, delta] = to > from ? [from + 1, to, -1] : [to, from - 1, 1];

    return items
        .filter((item) => item.position >= first && item.position <= last)
        .map((item) => entityUpdated(collection, item.id, { position: item.position + delta }));
};

/**
 * Moves the to-dos filed in `sequences` back to the unorganized panel.
 *
 * They are appended after the loose to-dos already there, in sequence order and
 * then to-do order — the same order `sequencesRepo.remove` reindexes them into
 * server-side. Without the repositioning they would keep the positions they held
 * inside their sequence and collide with the loose ones.
 */
const freeTodos = (state, sequences) => {
    const firstPosition = unorganizedCount(state);
    const freed = sequences.flatMap((sequence) => todosIn(state, sequence.id));

    return freed.map((todo, offset) =>
        entityUpdated('todos', todo.id, {
            sequenceId: null,
            position: firstPosition + offset,
        })
    );
};

/** Makes room for a layer arriving at `index`, top to bottom. */
export const shiftLayersForInsert = (state, index) =>
    makeRoom('layers', layersOf(state), index);

/**
 * Everything that follows deleting a sequence, beyond removing the sequence
 * itself: its to-dos return to the unorganized panel, and the sequences to its
 * right in the layer close up.
 */
export const cascadeSequenceRemoval = (state, sequenceId) => {
    const sequence = requireEntity(state, 'sequences', sequenceId);

    return [
        ...freeTodos(state, [sequence]),
        ...closeGap('sequences', sequencesIn(state, sequence.layerId), sequence.position),
    ];
};

/**
 * Everything that follows deleting a layer: its sequences go with it, so their
 * to-dos return to the unorganized panel, and the layers beneath move up.
 */
export const cascadeLayerRemoval = (state, layerId) => {
    const layer = requireEntity(state, 'layers', layerId);
    const doomed = sequencesIn(state, layerId);

    return [
        ...doomed.map((sequence) => entityRemoved('sequences', sequence.id)),
        ...freeTodos(state, doomed),
        ...closeGap('layers', layersOf(state), layer.position),
    ];
};

/**
 * Everything that follows deleting a to-do: the list that held it — a sequence,
 * or the unorganized panel — closes up behind it.
 */
export const cascadeTodoRemoval = (state, todoId) => {
    const todo = requireEntity(state, 'todos', todoId);

    return closeGap('todos', todosIn(state, todo.sequenceId), todo.position);
};

/**
 * Everything that follows putting a to-do at a position in a list — the one
 * cascade behind both cases of `PUT /api/todos/:id/move`.
 *
 * Changing lists: the one it left closes up, and the one it joins opens a slot
 * at the insert point. Because `sequenceId: null` is the unorganized panel
 * rather than a missing value, filing a to-do into a sequence and sending one
 * back out are the same move over two ordered lists.
 *
 * Staying in the same list is a reorder: only the to-dos between where it left
 * and where it landed shift, and which way they shift depends on which way it
 * travelled. `position` there is the index it lands on once it has been lifted
 * out, matching the server rather than counting the to-do against itself.
 */
export const cascadeTodoMove = (state, todoId, { sequenceId, position }) => {
    const todo = requireEntity(state, 'todos', todoId);

    if (todo.sequenceId === sequenceId) {
        return shiftPassedOver(
            'todos',
            todosIn(state, sequenceId),
            todo.position,
            position
        );
    }

    return [
        ...closeGap('todos', todosIn(state, todo.sequenceId), todo.position),
        ...makeRoom('todos', todosIn(state, sequenceId), position),
    ];
};

/**
 * Everything that follows putting a sequence at a position in a layer — the one
 * cascade behind `PUT /api/sequences/:id/move`.
 *
 * Changing layers: the one it left closes up and the one it joins opens a slot.
 * That is the same reindexing the server does inside its transaction, so a
 * successful move changes nothing further and a failed one is rolled back whole.
 *
 * Staying in the same layer is a reorder: only the cards between where it left
 * and where it landed shift.
 */
export const cascadeSequenceMove = (state, sequenceId, { layerId, position }) => {
    const sequence = requireEntity(state, 'sequences', sequenceId);

    if (sequence.layerId === layerId) {
        return shiftPassedOver(
            'sequences',
            sequencesIn(state, layerId),
            sequence.position,
            position
        );
    }

    return [
        ...closeGap('sequences', sequencesIn(state, sequence.layerId), sequence.position),
        ...makeRoom('sequences', sequencesIn(state, layerId), position),
    ];
};
