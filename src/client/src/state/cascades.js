// What else changes when a layer or a sequence is added or deleted.
//
// The server does more than the one row a mutation names: positions stay dense
// 0..n-1, deleting a sequence returns its to-dos to the unorganized panel, and
// deleting a layer takes its sequences — and their edges — with it. An
// optimistic update that only moved the named row would leave the canvas
// disagreeing with the database until the next reload, so these functions work
// out the same moves and hand them back as reducer actions.
//
// Everything here is a pure function of the state it is given. It reads that
// state and returns new action objects; it never writes to it.

import { canConnect, sortByPosition } from '../lib/graph';
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

const removeEdgesTouching = (state, sequenceIds) => {
    const doomed = new Set(sequenceIds);

    return Object.values(state.edges)
        .filter((edge) => doomed.has(edge.parentId) || doomed.has(edge.childId))
        .map((edge) => entityRemoved('edges', edge.id));
};

/** Makes room for a layer arriving at `index`, top to bottom. */
export const shiftLayersForInsert = (state, index) =>
    makeRoom('layers', layersOf(state), index);

/**
 * Everything that follows deleting a sequence, beyond removing the sequence
 * itself: its edges go, its to-dos return to the unorganized panel, and the
 * sequences to its right in the layer close up.
 */
export const cascadeSequenceRemoval = (state, sequenceId) => {
    const sequence = requireEntity(state, 'sequences', sequenceId);

    return [
        ...removeEdgesTouching(state, [sequenceId]),
        ...freeTodos(state, [sequence]),
        ...closeGap('sequences', sequencesIn(state, sequence.layerId), sequence.position),
    ];
};

/**
 * Everything that follows deleting a layer: its sequences go with it, so their
 * edges go and their to-dos return to the unorganized panel, and the layers
 * beneath move up.
 */
export const cascadeLayerRemoval = (state, layerId) => {
    const layer = requireEntity(state, 'layers', layerId);
    const doomed = sequencesIn(state, layerId);

    return [
        ...doomed.map((sequence) => entityRemoved('sequences', sequence.id)),
        ...removeEdgesTouching(
            state,
            doomed.map((sequence) => sequence.id)
        ),
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
 * The edges a sequence's move would leave pointing the wrong way.
 *
 * `canConnect` is the same rule the server enforces in `assertCanConnect`: a
 * parent's layer must be strictly above its child's. Both ends are re-read
 * against the graph AS IT WILL BE — the moving sequence in its new layer, every
 * other sequence where it already is — because whether an edge survives depends
 * on where the move puts things, not where they are now.
 */
const edgesInvalidatedBy = (state, sequence, layerId) => {
    const layers = sortByPosition(Object.values(state.layers));
    const moved = { ...sequence, layerId };
    const after = (candidate) => (candidate.id === sequence.id ? moved : candidate);

    return Object.values(state.edges)
        .filter((edge) => edge.parentId === sequence.id || edge.childId === sequence.id)
        .filter((edge) => {
            const parent = state.sequences[edge.parentId];
            const child = state.sequences[edge.childId];

            // A missing parent or child means state is transiently stale (the
            // schema's ON DELETE CASCADE means a persisted edge can never
            // actually dangle) — kept, not removed, since acting on an
            // incomplete picture is worse than a no-op, and because calling
            // `after()` on a missing sequence would throw.
            if (!parent || !child) return false;

            return !canConnect(after(parent), after(child), layers);
        })
        .map((edge) => entityRemoved('edges', edge.id));
};

/**
 * Everything that follows putting a sequence at a position in a layer — the one
 * cascade behind `PUT /api/sequences/:id/move`.
 *
 * Changing layers: the one it left closes up, the one it joins opens a slot, and
 * any edge the move leaves pointing upward or sideways goes. That last part is
 * the same derivation the server runs inside its transaction, from the same rule
 * in `lib/graph`, so a successful move changes nothing further and a failed one
 * is rolled back whole.
 *
 * Staying in the same layer is a reorder: only the cards between where it left
 * and where it landed shift, and no edge can be invalidated by a move that
 * changes no layer — but the check runs anyway rather than being special-cased,
 * because "which edges break" is one question with one answer.
 */
export const cascadeSequenceMove = (state, sequenceId, { layerId, position }) => {
    const sequence = requireEntity(state, 'sequences', sequenceId);
    const doomedEdges = edgesInvalidatedBy(state, sequence, layerId);

    if (sequence.layerId === layerId) {
        return [
            ...doomedEdges,
            ...shiftPassedOver(
                'sequences',
                sequencesIn(state, layerId),
                sequence.position,
                position
            ),
        ];
    }

    return [
        ...doomedEdges,
        ...closeGap('sequences', sequencesIn(state, sequence.layerId), sequence.position),
        ...makeRoom('sequences', sequencesIn(state, layerId), position),
    ];
};
