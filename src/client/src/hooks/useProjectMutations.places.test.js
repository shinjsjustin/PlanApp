import { act } from '@testing-library/react';

import { api } from '../lib/api';
import { GRAPH, renderMutations } from '../testUtils/mutationsHarness';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
    };
});

beforeEach(() => jest.clearAllMocks());

describe('setTodoPlace', () => {
    test.each([7, null])('patches placeId %p and shows it before the request resolves', async (placeId) => {
        const { result, stateOf } = await renderMutations();
        let resolve;
        api.patch.mockReturnValue(new Promise((r) => { resolve = r; }));

        let pending;
        act(() => {
            pending = result.current.setTodoPlace(1000, placeId);
        });

        expect(stateOf().todos[1000].placeId).toBe(placeId);
        expect(api.patch).toHaveBeenCalledWith('/todos/1000', { placeId });
        await act(async () => {
            resolve({ ...GRAPH.todos[0], placeId });
            await pending;
        });
        expect(stateOf().todos[1000].placeId).toBe(placeId);
    });

    test('rolls back when the request fails', async () => {
        const { result, stateOf } = await renderMutations();
        api.patch.mockRejectedValue(new Error('nope'));

        await act(async () => {
            await result.current.setTodoPlace(1000, 7);
        });

        expect(stateOf().todos[1000].placeId).toBeUndefined();
    });
});

describe('setSequencePlace', () => {
    test('shows the placeId before the request resolves and keeps it after', async () => {
        const { result, stateOf } = await renderMutations();
        let resolve;
        api.patch.mockReturnValue(new Promise((r) => { resolve = r; }));

        let pending;
        act(() => {
            pending = result.current.setSequencePlace(100, 3);
        });

        expect(stateOf().sequences[100].placeId).toBe(3);
        expect(api.patch).toHaveBeenCalledWith('/sequences/100', { placeId: 3 });
        await act(async () => {
            resolve({ ...GRAPH.sequences[0], placeId: 3 });
            await pending;
        });
        expect(stateOf().sequences[100].placeId).toBe(3);
    });
});
