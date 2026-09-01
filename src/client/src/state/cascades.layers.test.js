import {
    cascadeLayerRemoval,
    shiftLayersForInsert,
} from './cascades';
import { entityAdded, entityRemoved, entityUpdated } from './projectActions';
import { GRAPH, apply, loaded, positions } from './cascadeHarness';

// Adding, renaming and deleting a layer — and what each does to the layers,
// sequences and to-dos around it (spec section 4.7).

describe('adding a layer', () => {
    test('shifts every layer at or below the insert point down by one', () => {
        // Arrange
        const state = loaded();

        // Act — a new layer goes directly below "Learning", at position 1.
        const next = apply(state, [
            entityAdded('layers', { id: -1, projectId: 1, title: 'Untitled layer', position: 1 }),
            ...shiftLayersForInsert(state, 1),
        ]);

        // Assert
        expect(positions(next.layers)).toEqual([
            [10, 0],
            [-1, 1],
            [20, 2],
            [30, 3],
        ]);
    });

    test('shifts nothing when the layer is appended at the end', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [
            entityAdded('layers', { id: -1, projectId: 1, title: 'Untitled layer', position: 3 }),
            ...shiftLayersForInsert(state, 3),
        ]);

        // Assert
        expect(positions(next.layers)).toEqual([
            [10, 0],
            [20, 1],
            [30, 2],
            [-1, 3],
        ]);
    });
});

describe('renaming a layer', () => {
    test('changes only the title of the layer named', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityUpdated('layers', 10, { title: 'Foundations' })]);

        // Assert
        expect(next.layers[10]).toEqual({ ...GRAPH.layers[0], title: 'Foundations' });
        expect(next.layers[20]).toEqual(GRAPH.layers[1]);
    });
});

describe('deleting a layer', () => {
    test('closes the gap it leaves in the layer order', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityRemoved('layers', 10), ...cascadeLayerRemoval(state, 10)]);

        // Assert
        expect(positions(next.layers)).toEqual([
            [20, 0],
            [30, 1],
        ]);
    });

    test('takes its sequences with it', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityRemoved('layers', 10), ...cascadeLayerRemoval(state, 10)]);

        // Assert
        expect(Object.keys(next.sequences)).toEqual(['200']);
    });

    test('returns their to-dos to the unorganized panel rather than destroying them', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityRemoved('layers', 10), ...cascadeLayerRemoval(state, 10)]);

        // Assert — the loose to-do keeps position 0 and the freed ones follow it,
        // in sequence order and then to-do order, exactly as the server appends.
        const unorganized = Object.values(next.todos).filter((todo) => todo.sequenceId === null);
        expect(
            unorganized.map((todo) => [todo.id, todo.position]).sort((a, b) => a[1] - b[1])
        ).toEqual([
            [1000, 0],
            [1001, 1],
            [1002, 2],
            [1003, 3],
        ]);
        expect(Object.keys(next.todos)).toHaveLength(4);
    });

    test('takes every edge touching its sequences with it', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityRemoved('layers', 10), ...cascadeLayerRemoval(state, 10)]);

        // Assert
        expect(next.edges).toEqual({});
    });
});
