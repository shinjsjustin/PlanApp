import {
    SEQUENCE_STATUS,
    activeSequenceIds,
    pinnedTodosOf,
    sequenceStatus,
    sortByPosition,
    topPinnedTodoOf,
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
    isPinned: false,
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

describe('pin derivations', () => {
    test('activeSequenceIds returns every sequence containing a pin, not just one', () => {
        // Arrange
        const sequences = [sequence(1, LEARNING.id), sequence(2, DESIGN.id), sequence(3, BUILD.id)];
        const todos = [
            todo(101, 1, 'incomplete', 0, { isPinned: true }),
            todo(201, 2, 'complete', 0, { isPinned: true }),
            todo(301, 3, 'blocked', 0, { isPinned: true }),
        ];

        // Act
        const activeIds = activeSequenceIds(sequences, todos);

        // Assert
        expect(activeIds).toEqual(new Set([1, 2, 3]));
    });

    test('activeSequenceIds returns two ids when two sequences each hold a pin', () => {
        // Arrange
        const sequences = [sequence(1, LEARNING.id), sequence(2, DESIGN.id)];
        const todos = [
            todo(101, 1, 'incomplete', 0, { isPinned: true }),
            todo(201, 2, 'incomplete', 0, { isPinned: true }),
        ];

        // Act & Assert
        expect(activeSequenceIds(sequences, todos)).toEqual(new Set([1, 2]));
    });

    test('activeSequenceIds returns an empty Set when nothing is pinned', () => {
        // Arrange
        const sequences = [sequence(1, LEARNING.id)];
        const todos = [todo(101, 1, 'incomplete', 0)];

        // Act & Assert
        expect(activeSequenceIds(sequences, todos)).toEqual(new Set());
    });

    test('activeSequenceIds ignores a pinned to-do that belongs to no sequence', () => {
        // Arrange
        const sequences = [sequence(1, LEARNING.id)];
        const todos = [todo(999, null, 'incomplete', 0, { isPinned: true })];

        // Act & Assert
        expect(activeSequenceIds(sequences, todos)).toEqual(new Set());
    });

    test('topPinnedTodoOf picks the smallest position regardless of status', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [
            todo(102, 1, 'incomplete', 2, { isPinned: true }),
            todo(101, 1, 'incomplete', 1, { isPinned: true }),
        ];

        // Act & Assert
        expect(topPinnedTodoOf(seq, todos).id).toBe(101);
    });

    test('topPinnedTodoOf picks a complete pinned to-do when it has the smallest position', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [
            todo(102, 1, 'incomplete', 2, { isPinned: true }),
            todo(101, 1, 'complete', 1, { isPinned: true }),
        ];

        // Act & Assert
        expect(topPinnedTodoOf(seq, todos).id).toBe(101);
    });

    test('topPinnedTodoOf picks a blocked pinned to-do when it has the smallest position', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [
            todo(102, 1, 'incomplete', 2, { isPinned: true }),
            todo(101, 1, 'blocked', 1, { isPinned: true }),
        ];

        // Act & Assert
        expect(topPinnedTodoOf(seq, todos).id).toBe(101);
    });

    test('topPinnedTodoOf returns null when the sequence has no pin', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [todo(101, 1, 'incomplete', 0)];

        // Act & Assert
        expect(topPinnedTodoOf(seq, todos)).toBeNull();
    });

    test("pinnedTodosOf returns the sequence's pins in position order", () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [
            todo(103, 1, 'incomplete', 3, { isPinned: true }),
            todo(101, 1, 'complete', 1, { isPinned: true }),
            todo(102, 1, 'blocked', 2, { isPinned: true }),
        ];

        // Act
        const pinned = pinnedTodosOf(seq, todos);

        // Assert
        expect(pinned.map((item) => item.id)).toEqual([101, 102, 103]);
    });

    test('pinnedTodosOf ignores pins belonging to another sequence', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [
            todo(101, 1, 'incomplete', 0, { isPinned: true }),
            todo(201, 2, 'incomplete', 0, { isPinned: true }),
        ];

        // Act & Assert
        expect(pinnedTodosOf(seq, todos).map((item) => item.id)).toEqual([101]);
    });

    test('pinnedTodosOf ignores unorganized pins', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const todos = [
            todo(101, 1, 'incomplete', 0, { isPinned: true }),
            todo(999, null, 'incomplete', 0, { isPinned: true }),
        ];

        // Act & Assert
        expect(pinnedTodosOf(seq, todos).map((item) => item.id)).toEqual([101]);
    });

    test('new helpers leave unsorted sequences and to-dos untouched', () => {
        // Arrange
        const sequences = [
            sequence(2, DESIGN.id, { position: 2 }),
            sequence(1, LEARNING.id, { position: 1 }),
        ];
        const todos = [
            todo(202, 2, 'blocked', 2, { isPinned: true }),
            todo(101, 1, 'complete', 1, { isPinned: true }),
            todo(201, 2, 'incomplete', 1, { isPinned: true }),
        ];
        const sequencesBefore = JSON.parse(JSON.stringify(sequences));
        const todosBefore = JSON.parse(JSON.stringify(todos));

        // Act
        pinnedTodosOf(sequences[0], todos);
        topPinnedTodoOf(sequences[0], todos);
        activeSequenceIds(sequences, todos);

        // Assert
        expect(sequences).toEqual(sequencesBefore);
        expect(todos).toEqual(todosBefore);
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
