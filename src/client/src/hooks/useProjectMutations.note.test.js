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

describe('updateTodoNote', () => {
    test('patches the trimmed note with internal newlines intact', async () => {
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.todos[0], note: 'a\n\nb' });

        await act(async () => {
            await result.current.updateTodoNote(1000, '  a\n\nb \n');
        });

        expect(api.patch).toHaveBeenCalledWith('/todos/1000', { note: 'a\n\nb' });
        expect(stateOf().todos[1000].note).toBe('a\n\nb');
    });

    test.each(['', '  \n '])('patches null for a blank note %#', async (note) => {
        const { result } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.todos[0], note: null });

        await act(async () => {
            await result.current.updateTodoNote(1000, note);
        });

        expect(api.patch).toHaveBeenCalledWith('/todos/1000', { note: null });
    });
});
