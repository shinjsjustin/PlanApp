import {
    SEQUENCE_STATUS,
    sequenceStatus,
    sortByPosition,
    todoCountsOf,
} from './graph';

// Fixtures follow the spec's worked example: a `learning` layer feeding a
// `design` layer, which in turn feeds a `build` layer.
const layer = (id, position) => ({ id, projectId: 1, title: `Layer ${id}`, position });
const sequence = (id, layerId, overrides = {}) => ({
    id,
    projectId: 1,
    layerId,
    title: `Sequence ${id}`,
    isBlocked: false,
    position: 0,
    ...overrides,
});
const todo = (id, sequenceId, status, position = 0, overrides = {}) => ({
    id,
    projectId: 1,
    sequenceId,
    text: `To-do ${id}`,
    status,
    position,
    ...overrides,
});
const LEARNING = layer(10, 0);
const DESIGN = layer(20, 1);
const BUILD = layer(30, 2);
const LAYERS = [LEARNING, DESIGN, BUILD];

describe('sequenceStatus', () => {
    test('reports an empty sequence as incomplete', () => {
        expect(sequenceStatus(sequence(1, LEARNING.id), [])).toBe(SEQUENCE_STATUS.incomplete);
    });

    test('reports a sequence with every to-do complete as complete', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [todo(101, 1, 'complete', 0), todo(102, 1, 'complete', 1)];

        // Act & Assert
        expect(sequenceStatus(seq, todos)).toBe(SEQUENCE_STATUS.complete);
    });

    test('reports a sequence with one to-do still open as incomplete', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [todo(101, 1, 'complete', 0), todo(102, 1, 'incomplete', 1)];

        // Act & Assert
        expect(sequenceStatus(seq, todos)).toBe(SEQUENCE_STATUS.incomplete);
    });

    test('does not count a blocked to-do as complete', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [todo(101, 1, 'complete', 0), todo(102, 1, 'blocked', 1)];

        // Act & Assert
        expect(sequenceStatus(seq, todos)).toBe(SEQUENCE_STATUS.incomplete);
    });

    test('lets the manual block override an otherwise complete sequence', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id, { isBlocked: true });
        const todos = [todo(101, 1, 'complete', 0)];

        // Act & Assert — `is_blocked` wins over everything (spec 4.3).
        expect(sequenceStatus(seq, todos)).toBe(SEQUENCE_STATUS.blocked);
    });

    test('lets the manual block override an empty sequence', () => {
        expect(sequenceStatus(sequence(1, LEARNING.id, { isBlocked: true }), [])).toBe(
            SEQUENCE_STATUS.blocked
        );
    });

    test('ignores to-dos belonging to other sequences', () => {
        // Arrange — the whole project's to-dos, not just this sequence's.
        const seq = sequence(1, LEARNING.id);
        const todos = [todo(101, 1, 'complete', 0), todo(201, 2, 'incomplete', 0)];

        // Act & Assert
        expect(sequenceStatus(seq, todos)).toBe(SEQUENCE_STATUS.complete);
    });

    test('ignores unorganized to-dos', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [todo(101, 1, 'complete', 0), todo(999, null, 'incomplete', 0)];

        // Act & Assert
        expect(sequenceStatus(seq, todos)).toBe(SEQUENCE_STATUS.complete);
    });
});

describe('sortByPosition', () => {
    test('orders items by their position', () => {
        // Arrange
        const items = [layer(3, 2), layer(1, 0), layer(2, 1)];

        // Act & Assert
        expect(sortByPosition(items).map((item) => item.id)).toEqual([1, 2, 3]);
    });

    test('returns a new array and leaves the input untouched', () => {
        // Arrange
        const items = [layer(3, 2), layer(1, 0)];

        // Act
        const sorted = sortByPosition(items);

        // Assert
        expect(sorted).not.toBe(items);
        expect(items.map((item) => item.id)).toEqual([3, 1]);
    });
});

// -- What a card counts -----------------------------------------------------
//
// Derived on every render, so none of it can go stale.

describe('todoCountsOf', () => {
    const sequence = { id: 1, isBlocked: false };

    test('counts what is done, what there is, and what is left', () => {
        // Arrange
        const todos = [
            { id: 1, sequenceId: 1, status: 'complete', position: 0 },
            { id: 2, sequenceId: 1, status: 'incomplete', position: 1 },
            { id: 3, sequenceId: 1, status: 'blocked', position: 2 },
        ];

        // Act & Assert — a blocked to-do is not done, so it is still left.
        expect(todoCountsOf(sequence, todos)).toEqual({ done: 1, total: 3, remaining: 2 });
    });

    test('counts an empty sequence as zero of zero', () => {
        expect(todoCountsOf(sequence, [])).toEqual({ done: 0, total: 0, remaining: 0 });
    });

    test('ignores to-dos filed elsewhere', () => {
        // Arrange
        const todos = [
            { id: 1, sequenceId: 1, status: 'complete', position: 0 },
            { id: 2, sequenceId: 2, status: 'complete', position: 0 },
            { id: 3, sequenceId: null, status: 'complete', position: 0 },
        ];

        // Act & Assert
        expect(todoCountsOf(sequence, todos)).toEqual({ done: 1, total: 1, remaining: 0 });
    });
});
