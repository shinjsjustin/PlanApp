import {
    SEQUENCE_STATUS,
    activeSequenceId,
    canConnect,
    readyFrontier,
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
const todo = (id, sequenceId, status, position = 0) => ({
    id,
    projectId: 1,
    sequenceId,
    text: `To-do ${id}`,
    status,
    position,
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

describe('readyFrontier', () => {
    test('includes the first sequence of a layer as soon as it is incomplete', () => {
        // Arrange
        const aerodynamics = sequence(1, LEARNING.id, { title: 'Learn aerodynamics' });
        const graph = {
            layers: LAYERS,
            sequences: [aerodynamics],
            todos: [todo(101, 1, 'incomplete', 0)],
        };

        // Act
        const frontier = readyFrontier(graph);

        // Assert
        expect(frontier).toEqual([
            { sequence: aerodynamics, nextTodo: expect.objectContaining({ id: 101 }) },
        ]);
    });

    test('takes the first incomplete to-do by position, not the first to-do', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);
        const graph = {
            layers: LAYERS,
            sequences: [seq],
            todos: [
                todo(103, 1, 'incomplete', 2),
                todo(101, 1, 'complete', 0),
                todo(102, 1, 'incomplete', 1),
            ],
        };

        // Act
        const [entry] = readyFrontier(graph);

        // Assert
        expect(entry.nextTodo.id).toBe(102);
    });

    test('reports a ready but empty sequence with no next to-do', () => {
        // Arrange
        const seq = sequence(1, LEARNING.id);

        // Act
        const frontier = readyFrontier({ layers: LAYERS, sequences: [seq], todos: [] });

        // Assert
        expect(frontier).toEqual([{ sequence: seq, nextTodo: null }]);
    });

    test('offers one sequence per layer, in layer order', () => {
        // Arrange — two layers with work outstanding in both.
        const electronics = sequence(2, LEARNING.id, { position: 1 });
        const rotor = sequence(3, DESIGN.id);
        const graph = {
            layers: LAYERS,
            sequences: [rotor, electronics],
            todos: [todo(201, 2, 'incomplete', 0), todo(301, 3, 'incomplete', 0)],
        };

        // Act
        const frontier = readyFrontier(graph);

        // Assert — learning first, design second, whatever order they arrive in.
        expect(frontier.map((entry) => entry.sequence.id)).toEqual([2, 3]);
    });

    test('offers only the leftmost unfinished sequence of a layer', () => {
        // Arrange — two sequences in the same layer, neither one finished.
        const aerodynamics = sequence(1, LEARNING.id, { position: 0 });
        const electronics = sequence(2, LEARNING.id, { position: 1 });
        const graph = {
            layers: LAYERS,
            sequences: [aerodynamics, electronics],
            todos: [todo(101, 1, 'incomplete', 0), todo(201, 2, 'incomplete', 0)],
        };

        // Act
        const frontier = readyFrontier(graph);

        // Assert
        expect(frontier.map((entry) => entry.sequence.id)).toEqual([1]);
    });

    test('advances to the next sequence in the layer once the leftmost is complete', () => {
        // Arrange
        const aerodynamics = sequence(1, LEARNING.id, { position: 0 });
        const electronics = sequence(2, LEARNING.id, { position: 1 });
        const graph = {
            layers: LAYERS,
            sequences: [aerodynamics, electronics],
            todos: [todo(101, 1, 'complete', 0), todo(201, 2, 'incomplete', 0)],
        };

        // Act
        const frontier = readyFrontier(graph);

        // Assert
        expect(frontier.map((entry) => entry.sequence.id)).toEqual([2]);
    });

    test('returns an empty frontier when every sequence is complete', () => {
        // Arrange
        const graph = {
            layers: LAYERS,
            sequences: [sequence(1, LEARNING.id), sequence(2, DESIGN.id)],
            todos: [todo(101, 1, 'complete', 0), todo(201, 2, 'complete', 0)],
        };

        // Act & Assert
        expect(readyFrontier(graph)).toEqual([]);
    });

    test('returns an empty frontier for a project with no sequences', () => {
        expect(readyFrontier({ layers: LAYERS, sequences: [], todos: [] })).toEqual([]);
    });

    test('leaves a blocked sequence out of the frontier, since spec section 3 keeps blocked work off the home page', () => {
        // Arrange — a manual block is "not this, not yet", not something to
        // start, so it no longer surfaces on the card.
        const seq = sequence(1, LEARNING.id, { isBlocked: true });

        // Act
        const frontier = readyFrontier({
            layers: LAYERS,
            sequences: [seq],
            todos: [todo(101, 1, 'incomplete', 0)],
        });

        // Assert
        expect(frontier.map((entry) => entry.sequence.id)).toEqual([]);
    });

    test('does not skip past a blocked sequence to a later one in its layer', () => {
        // Arrange — the block holds up its whole layer; the sequence behind it
        // waits its turn rather than taking it.
        const blocked = sequence(1, LEARNING.id, { isBlocked: true, position: 0 });
        const behind = sequence(2, LEARNING.id, { position: 1 });
        const graph = {
            layers: LAYERS,
            sequences: [blocked, behind],
            todos: [todo(101, 1, 'incomplete', 0), todo(201, 2, 'incomplete', 0)],
        };

        // Act
        const frontier = readyFrontier(graph);

        // Assert
        expect(frontier.map((entry) => entry.sequence.id)).toEqual([]);
    });

    test('lets a layer stand on its own when the one above it is blocked', () => {
        // Arrange — layers no longer gate one another.
        const blocked = sequence(1, LEARNING.id, { isBlocked: true });
        const rotor = sequence(2, DESIGN.id);
        const graph = {
            layers: LAYERS,
            sequences: [blocked, rotor],
            todos: [todo(101, 1, 'incomplete', 0), todo(201, 2, 'incomplete', 0)],
        };

        // Act
        const frontier = readyFrontier(graph);

        // Assert
        expect(frontier.map((entry) => entry.sequence.id)).toEqual([2]);
    });
});

describe('canConnect', () => {
    test('allows an edge to the next layer down', () => {
        expect(canConnect(sequence(1, LEARNING.id), sequence(2, DESIGN.id), LAYERS)).toBe(true);
    });

    test('allows an edge that skips a layer', () => {
        // Arrange — network comms feeds straight past the design layer (spec 1).
        expect(canConnect(sequence(1, LEARNING.id), sequence(2, BUILD.id), LAYERS)).toBe(true);
    });

    test('rejects an edge within the same layer', () => {
        expect(canConnect(sequence(1, LEARNING.id), sequence(2, LEARNING.id), LAYERS)).toBe(false);
    });

    test('rejects an upward edge', () => {
        expect(canConnect(sequence(1, DESIGN.id), sequence(2, LEARNING.id), LAYERS)).toBe(false);
    });

    test('rejects a sequence connecting to itself', () => {
        const seq = sequence(1, LEARNING.id);
        expect(canConnect(seq, seq, LAYERS)).toBe(false);
    });

    test('rejects a pair from two different projects', () => {
        // Arrange — same layer positions, different projects.
        const theirLayer = { id: 40, projectId: 2, title: 'Theirs', position: 5 };
        const parent = sequence(1, LEARNING.id);
        const child = { ...sequence(2, theirLayer.id), projectId: 2 };

        // Act & Assert
        expect(canConnect(parent, child, [...LAYERS, theirLayer])).toBe(false);
    });

    test('rejects a pair whose layers are not in the list', () => {
        expect(canConnect(sequence(1, 999), sequence(2, DESIGN.id), LAYERS)).toBe(false);
    });

    test('rejects a missing parent or child rather than throwing', () => {
        expect(canConnect(null, sequence(2, DESIGN.id), LAYERS)).toBe(false);
        expect(canConnect(sequence(1, LEARNING.id), null, LAYERS)).toBe(false);
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

// -- What a card counts, and which card is in operation ---------------------
//
// `todoCountsOf` feeds every count on a card; `activeSequenceId` decides the one
// card that carries the spotlight. Both are derived on every render — nothing
// here is ever stored, so none of it can go stale.

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

describe('activeSequenceId', () => {
    const layers = [
        { id: 10, position: 0 },
        { id: 20, position: 1 },
    ];

    const sequence = (id, layerId, position, isBlocked = false) => ({
        id,
        layerId,
        position,
        isBlocked,
    });

    const todo = (id, sequenceId, status = 'incomplete') => ({
        id,
        sequenceId,
        status,
        position: id,
    });

    test('picks the startable sequence in the topmost layer', () => {
        // Arrange
        const sequences = [sequence(2, 20, 0), sequence(1, 10, 0)];
        const todos = [todo(1, 1), todo(2, 2)];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBe(1);
    });

    test('takes the leftmost sequence within a layer', () => {
        // Arrange
        const sequences = [sequence(2, 10, 1), sequence(1, 10, 0)];
        const todos = [todo(1, 1), todo(2, 2)];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBe(1);
    });

    test('hands the ring on once the leftmost sequence is complete', () => {
        // Arrange
        const sequences = [sequence(1, 10, 0), sequence(2, 10, 1)];
        const todos = [todo(1, 1, 'complete'), todo(2, 2)];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBe(2);
    });

    // A blocked sequence shows the red waiting-on line, never the purple ring.
    test('never picks a blocked sequence', () => {
        // Arrange
        const sequences = [sequence(1, 10, 0, true), sequence(2, 20, 0)];
        const todos = [todo(1, 1), todo(2, 2)];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBe(2);
    });

    // The ring says "start here", and a layer led by a block is not started —
    // the sequence behind it waits rather than taking its turn.
    test('keeps the ring off a sequence sitting behind a blocked one in its layer', () => {
        // Arrange — the only startable-looking sequence is behind the block.
        const sequences = [sequence(1, 10, 0, true), sequence(2, 10, 1)];
        const todos = [todo(1, 1), todo(2, 2)];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBeNull();
    });

    test('skips a sequence holding nothing to pick up', () => {
        // Arrange — sequence 1 is startable but empty, so there is no next step.
        const sequences = [sequence(1, 10, 0), sequence(2, 20, 0)];
        const todos = [todo(2, 2)];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBe(2);
    });

    test('returns null when the whole project is finished', () => {
        // Arrange
        const sequences = [sequence(1, 10, 0)];
        const todos = [todo(1, 1, 'complete')];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBeNull();
    });

    test('returns null for a project with no sequences at all', () => {
        expect(activeSequenceId({ layers, sequences: [], todos: [] })).toBeNull();
    });

    test('passes over a sequence whose layer is missing rather than throwing', () => {
        // Arrange
        const sequences = [sequence(1, 999, 0), sequence(2, 10, 0)];
        const todos = [todo(1, 1), todo(2, 2)];

        // Act & Assert
        expect(activeSequenceId({ layers, sequences, todos })).toBe(2);
    });
});
