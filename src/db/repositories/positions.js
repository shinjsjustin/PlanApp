'use strict';

/**
 * Dense-position reindexing helpers (spec section 4.2).
 *
 * Ordered lists in PlanApp — layers in a project, sequences in a layer, to-dos in
 * a sequence — keep `position` dense: 0..n-1 with no gaps. These helpers work on
 * a plain array of ids in display order and always return a NEW array; the input
 * is never mutated. Callers turn the resulting ordering into `{ id, position }`
 * rows with `toPositions` and write them inside a transaction.
 */

const assertOrdering = (orderedIds) => {
    if (!Array.isArray(orderedIds)) {
        throw new TypeError('orderedIds must be an array of ids');
    }
};

const assertIndex = (index, maxIndex) => {
    if (!Number.isInteger(index)) {
        throw new RangeError(`position must be an integer, received ${index}`);
    }
    if (index < 0 || index > maxIndex) {
        throw new RangeError(`position ${index} is out of range 0..${maxIndex}`);
    }
};

const indexOfOrThrow = (orderedIds, id) => {
    const index = orderedIds.indexOf(id);
    if (index === -1) {
        throw new Error(`id ${id} is not in the ordering`);
    }
    return index;
};

/** Maps an ordering to dense `{ id, position }` rows. */
const toPositions = (orderedIds) => {
    assertOrdering(orderedIds);
    return orderedIds.map((id, position) => ({ id, position }));
};

/** Returns a new ordering with `id` inserted at `index`. */
const insertAt = (orderedIds, id, index) => {
    assertOrdering(orderedIds);
    assertIndex(index, orderedIds.length);
    if (orderedIds.includes(id)) {
        throw new Error(`id ${id} is already in the ordering`);
    }
    return [...orderedIds.slice(0, index), id, ...orderedIds.slice(index)];
};

/** Returns a new ordering with `id` removed and the gap closed. */
const removeItem = (orderedIds, id) => {
    assertOrdering(orderedIds);
    const index = indexOfOrThrow(orderedIds, id);
    return [...orderedIds.slice(0, index), ...orderedIds.slice(index + 1)];
};

/** Returns a new ordering with `id` relocated to `index`. */
const moveItem = (orderedIds, id, index) => {
    assertOrdering(orderedIds);
    indexOfOrThrow(orderedIds, id);
    assertIndex(index, orderedIds.length - 1);
    return insertAt(removeItem(orderedIds, id), id, index);
};

module.exports = { toPositions, insertAt, removeItem, moveItem };
