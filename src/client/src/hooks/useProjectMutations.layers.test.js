import { act } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { GRAPH, positionsIn, renderMutations } from '../testUtils/mutationsHarness';

// The layer verbs of `useProjectMutations` (spec section 4.4).

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

describe('addLayer', () => {
    test('appends a layer when no neighbour is named', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockResolvedValue({ id: 30, projectId: 1, title: 'Untitled layer', position: 2 });

        // Act
        await act(async () => {
            await result.current.addLayer();
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects/1/layers', {});
        expect(positionsIn(stateOf().layers)).toEqual([
            [10, 0],
            [20, 1],
            [30, 2],
        ]);
    });

    test('inserts below the named layer and pushes the ones beneath down', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockResolvedValue({ id: 30, projectId: 1, title: 'Untitled layer', position: 1 });

        // Act
        await act(async () => {
            await result.current.addLayer(10);
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects/1/layers', { afterLayerId: 10 });
        expect(positionsIn(stateOf().layers)).toEqual([
            [10, 0],
            [30, 1],
            [20, 2],
        ]);
    });

    test('refuses to guess when the named layer is not in the graph', async () => {
        // Arrange
        const { result } = await renderMutations();

        // Act + Assert — appending silently would put the layer somewhere the
        // user did not ask for.
        await expect(result.current.addLayer(999)).rejects.toThrow(/999/);
        expect(api.post).not.toHaveBeenCalled();
    });
});

describe('renameLayer', () => {
    test('patches the title and keeps the row the server stored', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.layers[0], title: 'Foundations' });

        // Act
        await act(async () => {
            await result.current.renameLayer(10, 'Foundations');
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/layers/10', { title: 'Foundations' });
        expect(stateOf().layers[10].title).toBe('Foundations');
    });
});

describe('deleteLayer', () => {
    test('takes its sequences with it, and frees their to-dos', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.delete.mockResolvedValue({ id: 10 });

        // Act
        await act(async () => {
            await result.current.deleteLayer(10);
        });

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/layers/10');
        expect(stateOf().layers[10]).toBeUndefined();
        expect(Object.keys(stateOf().sequences)).toEqual(['200']);
        expect(stateOf().todos[1001]).toMatchObject({ sequenceId: null, position: 1 });
        expect(positionsIn(stateOf().layers)).toEqual([[20, 0]]);
    });

    test('puts everything back when the request fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.delete.mockRejectedValue(new ApiError('Delete failed.', 500));

        // Act
        await act(async () => {
            await result.current.deleteLayer(10);
        });

        // Assert
        expect(Object.keys(stateOf().sequences).sort()).toEqual(['100', '101', '200']);
        expect(stateOf().todos[1001]).toMatchObject({ sequenceId: 100, position: 0 });
        expect(stateOf().actionError).toBe('Delete failed.');
    });
});
