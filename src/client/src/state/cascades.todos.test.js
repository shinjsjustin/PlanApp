import {
    cascadeTodoMove,
    cascadeTodoRemoval,
} from './cascades';
import { entityAdded, entityRemoved, entityUpdated } from './projectActions';
import { apply, loaded } from './cascadeHarness';

// Deleting a to-do and the three shapes of moving one: out of a sequence, into
// one, and within its own list. Every case closes the old list up and opens a
// slot in the new one, exactly as the server's reindexing does (spec 4.7).


/** One list's to-dos as `[id, position]` pairs. `sequenceId` null is the panel. */
const listPositions = (state, sequenceId) =>
    Object.values(state.todos)
        .filter((todo) => todo.sequenceId === sequenceId)
        .map((todo) => [todo.id, todo.position])
        .sort((a, b) => a[1] - b[1]);

describe('deleting a to-do', () => {
    test('closes the gap it leaves in its sequence', () => {
        // Arrange — sequence 100 holds 1001 at 0 and 1002 at 1.
        const state = loaded();

        // Act
        const next = apply(state, [entityRemoved('todos', 1001), ...cascadeTodoRemoval(state, 1001)]);

        // Assert
        expect(listPositions(next, 100)).toEqual([[1002, 0]]);
    });

    test('closes the gap it leaves in the unorganized panel', () => {
        // Arrange — 1000 is loose at 0; put another loose to-do after it.
        const state = apply(loaded(), [
            entityAdded('todos', {
                id: 1004,
                projectId: 1,
                sequenceId: null,
                text: 'Buy propellers',
                status: 'incomplete',
                position: 1,
            }),
        ]);

        // Act
        const next = apply(state, [entityRemoved('todos', 1000), ...cascadeTodoRemoval(state, 1000)]);

        // Assert
        expect(listPositions(next, null)).toEqual([[1004, 0]]);
    });

    test('leaves the other lists alone', () => {
        // Arrange
        const state = loaded();

        // Act
        const next = apply(state, [entityRemoved('todos', 1001), ...cascadeTodoRemoval(state, 1001)]);

        // Assert
        expect(listPositions(next, null)).toEqual([[1000, 0]]);
        expect(listPositions(next, 101)).toEqual([[1003, 0]]);
    });

    test('refuses to cascade from a to-do that is not in the graph', () => {
        expect(() => cascadeTodoRemoval(loaded(), 9999)).toThrow(/9999/);
    });
});

describe('moving a to-do out of a sequence', () => {
    test('closes the gap behind it and leaves the panel dense', () => {
        // Arrange — 1001 sits at 0 in sequence 100, ahead of 1002.
        const state = loaded();

        // Act — send it to the end of the unorganized panel, after 1000.
        const next = apply(state, [
            entityUpdated('todos', 1001, { sequenceId: null, position: 1 }),
            ...cascadeTodoMove(state, 1001, { sequenceId: null, position: 1 }),
        ]);

        // Assert
        expect(listPositions(next, null)).toEqual([
            [1000, 0],
            [1001, 1],
        ]);
        expect(listPositions(next, 100)).toEqual([[1002, 0]]);
    });

    test('makes room when it lands above the to-dos already there', () => {
        // Arrange
        const state = loaded();

        // Act — to the top of the panel, ahead of 1000.
        const next = apply(state, [
            entityUpdated('todos', 1001, { sequenceId: null, position: 0 }),
            ...cascadeTodoMove(state, 1001, { sequenceId: null, position: 0 }),
        ]);

        // Assert
        expect(listPositions(next, null)).toEqual([
            [1001, 0],
            [1000, 1],
        ]);
    });
});

describe('moving a to-do into a sequence', () => {
    test('pushes down the to-dos it lands above and empties its old list', () => {
        // Arrange — 1000 is the only loose to-do; sequence 100 holds 1001, 1002.
        const state = loaded();

        // Act — file it at the top of sequence 100.
        const next = apply(state, [
            entityUpdated('todos', 1000, { sequenceId: 100, position: 0 }),
            ...cascadeTodoMove(state, 1000, { sequenceId: 100, position: 0 }),
        ]);

        // Assert
        expect(listPositions(next, 100)).toEqual([
            [1000, 0],
            [1001, 1],
            [1002, 2],
        ]);
        expect(listPositions(next, null)).toEqual([]);
    });

    test('shifts only the to-dos below the insert point', () => {
        // Arrange
        const state = loaded();

        // Act — 1003 moves from sequence 101 into the middle of sequence 100.
        const next = apply(state, [
            entityUpdated('todos', 1003, { sequenceId: 100, position: 1 }),
            ...cascadeTodoMove(state, 1003, { sequenceId: 100, position: 1 }),
        ]);

        // Assert
        expect(listPositions(next, 100)).toEqual([
            [1001, 0],
            [1003, 1],
            [1002, 2],
        ]);
        expect(listPositions(next, 101)).toEqual([]);
    });

    test('refuses to cascade from a to-do that is not in the graph', () => {
        expect(() => cascadeTodoMove(loaded(), 9999, { sequenceId: 100, position: 0 })).toThrow(
            /9999/
        );
    });
});

/**
 * A drag that ends in the list it started in (spec section 4.7). `position` is
 * the index the to-do lands on once it has been lifted out, which is the same
 * index `moveItem` reindexes to server-side — so only the to-dos between where
 * it left and where it landed shift, and they shift in the direction it travelled.
 */
describe('reordering a to-do inside its own list', () => {
    /** Sequence 100 with a third to-do, so a middle position exists to pass over. */
    const withThreeInSequence = () =>
        apply(loaded(), [
            entityAdded('todos', {
                id: 1005,
                projectId: 1,
                sequenceId: 100,
                text: 'Read about stall',
                status: 'incomplete',
                position: 2,
            }),
        ]);

    test('shifts the to-dos it passed up when it moves down the list', () => {
        // Arrange — sequence 100 holds 1001, 1002, 1005.
        const state = withThreeInSequence();

        // Act — 1001 travels from the top to the bottom.
        const next = apply(state, [
            entityUpdated('todos', 1001, { sequenceId: 100, position: 2 }),
            ...cascadeTodoMove(state, 1001, { sequenceId: 100, position: 2 }),
        ]);

        // Assert
        expect(listPositions(next, 100)).toEqual([
            [1002, 0],
            [1005, 1],
            [1001, 2],
        ]);
    });

    test('shifts the to-dos it passed down when it moves up the list', () => {
        // Arrange
        const state = withThreeInSequence();

        // Act — 1005 travels from the bottom to the top.
        const next = apply(state, [
            entityUpdated('todos', 1005, { sequenceId: 100, position: 0 }),
            ...cascadeTodoMove(state, 1005, { sequenceId: 100, position: 0 }),
        ]);

        // Assert
        expect(listPositions(next, 100)).toEqual([
            [1005, 0],
            [1001, 1],
            [1002, 2],
        ]);
    });

    test('shifts only the to-dos between where it left and where it landed', () => {
        // Arrange
        const state = withThreeInSequence();

        // Act — 1001 stops in the middle, so 1005 below it never moves.
        const next = apply(state, [
            entityUpdated('todos', 1001, { sequenceId: 100, position: 1 }),
            ...cascadeTodoMove(state, 1001, { sequenceId: 100, position: 1 }),
        ]);

        // Assert
        expect(listPositions(next, 100)).toEqual([
            [1002, 0],
            [1001, 1],
            [1005, 2],
        ]);
    });

    test('moves nothing when the to-do is dropped back where it started', () => {
        // Arrange
        const state = withThreeInSequence();

        // Act
        const actions = cascadeTodoMove(state, 1002, { sequenceId: 100, position: 1 });

        // Assert
        expect(actions).toEqual([]);
    });

    test('reorders the unorganized panel the same way it reorders a sequence', () => {
        // Arrange — two loose to-dos, 1000 at 0 and 1006 at 1.
        const state = apply(loaded(), [
            entityAdded('todos', {
                id: 1006,
                projectId: 1,
                sequenceId: null,
                text: 'Buy propellers',
                status: 'incomplete',
                position: 1,
            }),
        ]);

        // Act
        const next = apply(state, [
            entityUpdated('todos', 1006, { sequenceId: null, position: 0 }),
            ...cascadeTodoMove(state, 1006, { sequenceId: null, position: 0 }),
        ]);

        // Assert
        expect(listPositions(next, null)).toEqual([
            [1006, 0],
            [1000, 1],
        ]);
    });
});
