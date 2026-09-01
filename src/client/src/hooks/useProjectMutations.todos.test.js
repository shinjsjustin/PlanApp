import { act } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { GRAPH, positionsIn, renderMutations } from '../testUtils/mutationsHarness';

// The to-do verbs of `useProjectMutations`, including the move endpoint
// that both a drag and the per-item menu action go through (spec 4.7).

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
        },
    };
});

beforeEach(() => {
    jest.clearAllMocks();
});

/** One list's to-dos as `[id, position]` pairs. `sequenceId` null is the panel. */
const todoPositions = (state, sequenceId) =>
    positionsIn(state.todos, (todo) => todo.sequenceId === sequenceId);

const savedTodo = (overrides) => ({
    id: 1002,
    projectId: 1,
    sequenceId: null,
    text: 'Buy propellers',
    status: 'incomplete',
    position: 1,
    ...overrides,
});

describe('addTodo', () => {
    test('appends to the unorganized panel when no sequence is named', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockResolvedValue(savedTodo());

        // Act
        await act(async () => {
            await result.current.addTodo('Buy propellers');
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects/1/todos', {
            text: 'Buy propellers',
            sequenceId: null,
        });
        expect(todoPositions(stateOf(), null)).toEqual([
            [1000, 0],
            [1002, 1],
        ]);
    });

    test('appends to the end of a sequence when one is named', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockResolvedValue(
            savedTodo({ id: 1003, sequenceId: 100, text: 'Read about drag', position: 1 })
        );

        // Act
        await act(async () => {
            await result.current.addTodo('Read about drag', 100);
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects/1/todos', {
            text: 'Read about drag',
            sequenceId: 100,
        });
        expect(todoPositions(stateOf(), 100)).toEqual([
            [1001, 0],
            [1003, 1],
        ]);
    });

    test('shows the to-do before the server answers', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockReturnValue(new Promise(() => {}));

        // Act
        await act(async () => {
            result.current.addTodo('Buy propellers');
        });

        // Assert — a temporary negative id stands in until the real one arrives.
        expect(Object.values(stateOf().todos).filter((todo) => todo.id < 0)).toEqual([
            expect.objectContaining({
                projectId: 1,
                sequenceId: null,
                text: 'Buy propellers',
                status: 'incomplete',
                position: 1,
            }),
        ]);
    });

    test('rolls the to-do back and reports a failed add', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockRejectedValue(new ApiError('text is required', 400));

        // Act
        await act(async () => {
            await result.current.addTodo('Buy propellers');
        });

        // Assert
        expect(todoPositions(stateOf(), null)).toEqual([[1000, 0]]);
        expect(stateOf().actionError).toBe('text is required');
    });
});

describe('setTodoStatus', () => {
    test('patches the status', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.todos[1], status: 'complete' });

        // Act
        await act(async () => {
            await result.current.setTodoStatus(1001, 'complete');
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/todos/1001', { status: 'complete' });
        expect(stateOf().todos[1001].status).toBe('complete');
    });

    test('re-derives the sequence status without storing one', async () => {
        // Arrange — sequence 100 holds only 1001, so ticking it completes it.
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.todos[1], status: 'complete' });

        // Act
        await act(async () => {
            await result.current.setTodoStatus(1001, 'complete');
        });

        // Assert — nothing on the sequence itself changed; status is computed.
        expect(stateOf().sequences[100]).toEqual(GRAPH.sequences[0]);
        expect(
            Object.values(stateOf().todos)
                .filter((todo) => todo.sequenceId === 100)
                .every((todo) => todo.status === 'complete')
        ).toBe(true);
    });
});

describe('moveTodoToUnorganized', () => {
    test('sends it to the end of the panel and leaves both lists dense', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.put.mockResolvedValue({ ...GRAPH.todos[1], sequenceId: null, position: 1 });

        // Act
        await act(async () => {
            await result.current.moveTodoToUnorganized(1001);
        });

        // Assert
        expect(api.put).toHaveBeenCalledWith('/todos/1001/move', {
            sequenceId: null,
            position: 1,
        });
        expect(todoPositions(stateOf(), null)).toEqual([
            [1000, 0],
            [1001, 1],
        ]);
        expect(todoPositions(stateOf(), 100)).toEqual([]);
    });

    test('puts it back in its sequence when the move fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.put.mockRejectedValue(new ApiError('position: out of range', 400));

        // Act
        await act(async () => {
            await result.current.moveTodoToUnorganized(1001);
        });

        // Assert
        expect(todoPositions(stateOf(), 100)).toEqual([[1001, 0]]);
        expect(todoPositions(stateOf(), null)).toEqual([[1000, 0]]);
        expect(stateOf().actionError).toBe('position: out of range');
    });
});

/**
 * The verb behind every drop (spec section 4.7). Filing a to-do into a sequence
 * and reordering one already there are the same endpoint and the same optimistic
 * path, so they are exercised through the same helper here.
 */
describe('moveTodo', () => {
    /** Puts a second to-do in sequence 100, so there is an order to rearrange. */
    const withTwoInSequence = async (result) => {
        api.post.mockResolvedValue(savedTodo({ sequenceId: 100, position: 1 }));

        await act(async () => {
            await result.current.addTodo('Buy propellers', 100);
        });
    };

    test('appends a to-do dropped on a sequence to the end of its list', async () => {
        // Arrange — sequence 100 holds 1001; 1000 is loose.
        const { result, stateOf } = await renderMutations();
        api.put.mockResolvedValue({ ...GRAPH.todos[0], sequenceId: 100, position: 1 });

        // Act
        await act(async () => {
            await result.current.moveTodo(1000, { sequenceId: 100, position: 1 });
        });

        // Assert
        expect(api.put).toHaveBeenCalledWith('/todos/1000/move', {
            sequenceId: 100,
            position: 1,
        });
        expect(todoPositions(stateOf(), 100)).toEqual([
            [1001, 0],
            [1000, 1],
        ]);
        expect(todoPositions(stateOf(), null)).toEqual([]);
    });

    test('inserts a to-do dropped on a gap at that index, pushing the rest down', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.put.mockResolvedValue({ ...GRAPH.todos[0], sequenceId: 100, position: 0 });

        // Act — onto the gap above 1001.
        await act(async () => {
            await result.current.moveTodo(1000, { sequenceId: 100, position: 0 });
        });

        // Assert
        expect(todoPositions(stateOf(), 100)).toEqual([
            [1000, 0],
            [1001, 1],
        ]);
    });

    test('reorders a to-do inside the sequence it is already in', async () => {
        // Arrange — sequence 100 holds 1001 at 0 and 1002 at 1.
        const { result, stateOf } = await renderMutations();
        await withTwoInSequence(result);
        api.put.mockResolvedValue({ ...GRAPH.todos[1], sequenceId: 100, position: 1 });

        // Act
        await act(async () => {
            await result.current.moveTodo(1001, { sequenceId: 100, position: 1 });
        });

        // Assert
        expect(todoPositions(stateOf(), 100)).toEqual([
            [1002, 0],
            [1001, 1],
        ]);
    });

    test('restores the order the list was in before the drag when the move fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        await withTwoInSequence(result);
        api.put.mockRejectedValue(new ApiError('position: out of range', 400));

        // Act
        await act(async () => {
            await result.current.moveTodo(1001, { sequenceId: 100, position: 1 });
        });

        // Assert
        expect(todoPositions(stateOf(), 100)).toEqual([
            [1001, 0],
            [1002, 1],
        ]);
        expect(stateOf().actionError).toBe('position: out of range');
    });
});

describe('deleteTodo', () => {
    test('removes it and closes the gap in its list', async () => {
        // Arrange — put a second to-do in the panel so there is a gap to close.
        const { result, stateOf } = await renderMutations();
        api.post.mockResolvedValue(savedTodo());
        await act(async () => {
            await result.current.addTodo('Buy propellers');
        });
        api.delete.mockResolvedValue({ id: 1000 });

        // Act
        await act(async () => {
            await result.current.deleteTodo(1000);
        });

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/todos/1000');
        expect(todoPositions(stateOf(), null)).toEqual([[1002, 0]]);
    });

    test('brings it back when the delete fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.delete.mockRejectedValue(new ApiError('To-do not found', 404));

        // Act
        await act(async () => {
            await result.current.deleteTodo(1001);
        });

        // Assert
        expect(todoPositions(stateOf(), 100)).toEqual([[1001, 0]]);
        expect(stateOf().actionError).toBe('To-do not found');
    });
});
