import {
    cascadeSequenceMove,
    cascadeSequenceRemoval,
} from './cascades';
import { entityAdded, entityRemoved, entityUpdated } from './projectActions';
import { GRAPH, apply, loaded } from './cascadeHarness';

// Adding, renaming, blocking and deleting a sequence. Deleting one frees its
// to-dos rather than destroying them, which is the `ON DELETE SET NULL` in the
// schema restated optimistically (spec section 4.2).

describe('adding a sequence', () => {
    test('appends it to the end of its layer without disturbing the others', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [
            entityAdded('sequences', {
                id: -1,
                projectId: 1,
                layerId: 10,
                title: 'Untitled sequence',
                description: null,
                isBlocked: false,
                position: 3,
            }),
        ]);

        // Assert
        const inLayer = Object.values(next.sequences).filter((s) => s.layerId === 10);
        expect(inLayer.map((s) => [s.id, s.position]).sort((a, b) => a[1] - b[1])).toEqual([
            [100, 0],
            [101, 1],
            [102, 2],
            [-1, 3],
        ]);
    });
});

describe('renaming a sequence', () => {
    test('changes only the title of the sequence named', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityUpdated('sequences', 100, { title: 'Aerodynamics' })]);

        // Assert
        expect(next.sequences[100]).toEqual({ ...GRAPH.sequences[0], title: 'Aerodynamics' });
        expect(next.sequences[101]).toEqual(GRAPH.sequences[1]);
    });
});

describe('toggling the blocked override on a sequence', () => {
    test('sets isBlocked without touching anything else', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityUpdated('sequences', 100, { isBlocked: true })]);

        // Assert
        expect(next.sequences[100]).toEqual({ ...GRAPH.sequences[0], isBlocked: true });
    });

    test('clears isBlocked again', () => {
        // Arrange
        const blocked = apply(loaded(), [entityUpdated('sequences', 100, { isBlocked: true })]);

        // Act
        const next = apply(blocked, [entityUpdated('sequences', 100, { isBlocked: false })]);

        // Assert
        expect(next.sequences[100].isBlocked).toBe(false);
    });
});

describe('deleting a sequence', () => {
    test('closes the gap it leaves in its layer', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [
            entityRemoved('sequences', 100),
            ...cascadeSequenceRemoval(state, 100),
        ]);

        // Assert
        const inLayer = Object.values(next.sequences).filter((s) => s.layerId === 10);
        expect(inLayer.map((s) => [s.id, s.position]).sort((a, b) => a[1] - b[1])).toEqual([
            [101, 0],
            [102, 1],
        ]);
    });

    test('leaves the sequences in other layers alone', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [
            entityRemoved('sequences', 100),
            ...cascadeSequenceRemoval(state, 100),
        ]);

        // Assert
        expect(next.sequences[200]).toEqual(GRAPH.sequences[3]);
    });

    test('returns its to-dos to the unorganized panel rather than destroying them', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [
            entityRemoved('sequences', 100),
            ...cascadeSequenceRemoval(state, 100),
        ]);

        // Assert
        expect(next.todos[1001]).toMatchObject({ sequenceId: null, position: 1 });
        expect(next.todos[1002]).toMatchObject({ sequenceId: null, position: 2 });
        expect(next.todos[1003]).toMatchObject({ sequenceId: 101, position: 0 });
    });

    test('takes the edges touching it with it, and only those', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [
            entityRemoved('sequences', 100),
            ...cascadeSequenceRemoval(state, 100),
        ]);

        // Assert
        expect(Object.keys(next.edges)).toEqual(['501']);
    });

    test('removes an edge that points at the sequence as a child', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [
            entityRemoved('sequences', 200),
            ...cascadeSequenceRemoval(state, 200),
        ]);

        // Assert
        expect(next.edges).toEqual({});
    });
});

describe('cascadeSequenceMove', () => {
    /**
     * Three layers with two sequences in each of the first two, and one edge
     * from the top layer's first card down to the middle layer's first card.
     */
    const stateWith = (overrides = {}) => ({
        layers: {
            10: { id: 10, position: 0 },
            20: { id: 20, position: 1 },
            30: { id: 30, position: 2 },
        },
        sequences: {
            1: { id: 1, layerId: 10, position: 0 },
            2: { id: 2, layerId: 10, position: 1 },
            3: { id: 3, layerId: 20, position: 0 },
            4: { id: 4, layerId: 20, position: 1 },
        },
        edges: {
            100: { id: 100, parentId: 1, childId: 3 },
        },
        todos: {},
        ...overrides,
    });

    test('closes the old layer and opens a slot in the new one', () => {
        // Arrange
        const state = stateWith({ edges: {} });

        // Act — sequence 1 leaves layer 10 for the front of layer 20.
        const actions = cascadeSequenceMove(state, 1, { layerId: 20, position: 0 });

        // Assert — 2 moves up behind it; 3 and 4 move down to make room.
        expect(actions).toEqual([
            entityUpdated('sequences', 2, { position: 0 }),
            entityUpdated('sequences', 3, { position: 1 }),
            entityUpdated('sequences', 4, { position: 2 }),
        ]);
    });

    test('shifts only the cards passed over in a same-layer reorder', () => {
        // Arrange — a layer-only move, so this also covers the pure-reorder case
        // where `edgesInvalidatedBy` must find nothing to remove.
        const state = stateWith({ edges: {} });

        // Act — sequence 1 moves to the end of layer 10.
        const actions = cascadeSequenceMove(state, 1, { layerId: 10, position: 1 });

        // Assert
        expect(actions).toEqual([entityUpdated('sequences', 2, { position: 0 })]);
    });

    test('removes an edge the move leaves pointing upward', () => {
        // Arrange — 1 is the parent of 3, which sits in layer 20.
        const state = stateWith();

        // Act — 1 drops to layer 30, below its own child.
        const actions = cascadeSequenceMove(state, 1, { layerId: 30, position: 0 });

        // Assert
        expect(actions).toContainEqual(entityRemoved('edges', 100));
    });

    test('removes an edge the move leaves inside one layer', () => {
        // Arrange
        const state = stateWith();

        // Act — 1 joins its own child's layer; parallel work gates nothing.
        const actions = cascadeSequenceMove(state, 1, { layerId: 20, position: 0 });

        // Assert
        expect(actions).toContainEqual(entityRemoved('edges', 100));
    });

    test('keeps an edge that still points downward after the move', () => {
        // Arrange — 1 parents 4, which is in layer 20; 1 moves within layer 10.
        const state = stateWith({ edges: { 100: { id: 100, parentId: 1, childId: 4 } } });

        // Act
        const actions = cascadeSequenceMove(state, 1, { layerId: 10, position: 1 });

        // Assert
        expect(actions).not.toContainEqual(entityRemoved('edges', 100));
    });

    test('leaves the state it was handed untouched', () => {
        // Arrange
        const state = stateWith();
        const snapshot = JSON.stringify(state);

        // Act
        cascadeSequenceMove(state, 1, { layerId: 30, position: 0 });

        // Assert
        expect(JSON.stringify(state)).toBe(snapshot);
    });

    test('removes an edge the move leaves pointing upward when the moving sequence is the child', () => {
        // Arrange — 3 is the child of 1, which stays in layer 10.
        const state = stateWith();

        // Act — 3 jumps above its own parent's layer.
        const actions = cascadeSequenceMove(state, 3, { layerId: 10, position: 0 });

        // Assert
        expect(actions).toContainEqual(entityRemoved('edges', 100));
    });
});
