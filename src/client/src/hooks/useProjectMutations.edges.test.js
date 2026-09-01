import { act } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { renderMutations } from '../testUtils/mutationsHarness';

// The one edge verb: connect mode toggles a tether on and off with the same
// gesture (spec decision 7).

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

describe('toggleEdge', () => {
    const edgeIds = (state) => Object.values(state.edges).map((edge) => edge.id);

    test('tethers a pair that is not connected yet', async () => {
        // Arrange — electronics also feeds the rotor design (spec section 1)
        const { result, stateOf } = await renderMutations();
        api.post.mockResolvedValue({ id: 501, projectId: 1, parentId: 101, childId: 200 });

        // Act
        await act(async () => {
            await result.current.toggleEdge(101, 200);
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects/1/edges', {
            parentId: 101,
            childId: 200,
        });
        expect(edgeIds(stateOf())).toEqual([500, 501]);
    });

    test('untethers a pair that is already connected', async () => {
        // Arrange — the same click that would have tethered it removes it
        const { result, stateOf } = await renderMutations();
        api.delete.mockResolvedValue({ parentId: 100, childId: 200 });

        // Act
        await act(async () => {
            await result.current.toggleEdge(100, 200);
        });

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/projects/1/edges?parentId=100&childId=200');
        expect(edgeIds(stateOf())).toEqual([]);
    });

    test('names the edge by its pair rather than by a body', async () => {
        // Arrange — DELETE is not reliably allowed a body, so the pair travels
        // in the query string (spec section 4.4)
        const { result } = await renderMutations();
        api.delete.mockResolvedValue({ parentId: 100, childId: 200 });

        // Act
        await act(async () => {
            await result.current.toggleEdge(100, 200);
        });

        // Assert
        expect(api.delete).toHaveBeenCalledTimes(1);
        expect(api.delete.mock.calls[0]).toHaveLength(1);
    });

    test('rolls the edge back and reports a failed tether', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockRejectedValue(
            new ApiError('Sequences 101 and 200 are already connected', 409)
        );

        // Act
        await act(async () => {
            await result.current.toggleEdge(101, 200);
        });

        // Assert
        expect(edgeIds(stateOf())).toEqual([500]);
        expect(stateOf().actionError).toBe('Sequences 101 and 200 are already connected');
    });

    test('puts the edge back and reports a failed untether', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.delete.mockRejectedValue(new ApiError('Edge not found', 404));

        // Act
        await act(async () => {
            await result.current.toggleEdge(100, 200);
        });

        // Assert
        expect(edgeIds(stateOf())).toEqual([500]);
        expect(stateOf().actionError).toBe('Edge not found');
    });
});
