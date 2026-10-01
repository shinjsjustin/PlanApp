import { act, renderHook, waitFor } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { PROJECT_STATUS } from '../state/projectReducer';
import useProjectGraph from './useProjectGraph';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
    };
});

const todo = (id, sequenceId, position) => ({
    id, projectId: 1, sequenceId, text: `To-do ${id}`, status: 'incomplete', isPinned: false, position, note: null,
});

const GRAPH = {
    project: { id: 1, title: 'Build a drone', description: null, todoCount: 3, completedTodoCount: 0 },
    layers: [{ id: 10, projectId: 1, title: 'Learning', position: 0 }],
    sequences: [
        { id: 100, projectId: 1, layerId: 10, title: 'Learn aerodynamics', isBlocked: false, position: 0 },
    ],
    todos: [todo(1, null, 0), todo(2, null, 1), todo(3, 100, 0)],
};

const renderLoaded = async () => {
    api.get.mockResolvedValue(GRAPH);
    const rendered = renderHook(() => useProjectGraph(1));
    await waitFor(() => expect(rendered.result.current.state.status).toBe(PROJECT_STATUS.ready));

    return rendered;
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useProjectGraph removeUnorganizedTodos', () => {
    test('removes every loose todo and sends one delete, keeping filed ones', async () => {
        const { result } = await renderLoaded();
        api.delete.mockResolvedValue({ ids: [1, 2] });

        await act(async () => {
            await result.current.removeUnorganizedTodos();
        });

        expect(Object.keys(result.current.state.todos)).toEqual(['3']);
        expect(api.delete).toHaveBeenCalledTimes(1);
        expect(api.delete).toHaveBeenCalledWith('/projects/1/todos/unorganized');
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('removes them from the graph before the request settles', async () => {
        const { result } = await renderLoaded();
        let finish;
        api.delete.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

        let pending;
        act(() => {
            pending = result.current.removeUnorganizedTodos();
        });

        expect(Object.keys(result.current.state.todos)).toEqual(['3']);
        await act(async () => {
            finish({ ids: [1, 2] });
            await pending;
        });
    });

    test('rolls the todos back and surfaces actionError when the request fails', async () => {
        const { result } = await renderLoaded();
        api.delete.mockRejectedValue(new ApiError('Nope.', 500));

        await act(async () => {
            await result.current.removeUnorganizedTodos();
        });

        expect(Object.keys(result.current.state.todos).sort()).toEqual(['1', '2', '3']);
        expect(result.current.state.actionError).toBe('Nope.');
    });

    test('reloads the graph when the server deleted different ids', async () => {
        const { result } = await renderLoaded();
        api.delete.mockResolvedValue({ ids: [1, 2, 4] });

        await act(async () => {
            await result.current.removeUnorganizedTodos();
        });

        expect(api.get).toHaveBeenCalledTimes(2);
    });
});
