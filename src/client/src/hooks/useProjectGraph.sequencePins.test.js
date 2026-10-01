import { act, renderHook, waitFor } from '@testing-library/react';

import { api } from '../lib/api';
import { PROJECT_STATUS } from '../state/projectReducer';
import useProjectGraph from './useProjectGraph';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
    };
});

const GRAPH = {
    project: { id: 1, title: 'Drone' },
    layers: [{ id: 10, projectId: 1, title: 'L', position: 0 }],
    sequences: [
        { id: 100, projectId: 1, layerId: 10, isPinned: false, position: 0 },
        { id: 101, projectId: 1, layerId: 10, isPinned: false, position: 1 },
    ],
    todos: [{ id: 1, sequenceId: 100, isPinned: false }],
};

const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });
    return { promise, ...settle };
};

const renderLoaded = async () => {
    api.get.mockResolvedValue(GRAPH);
    const rendered = renderHook(() => useProjectGraph(1));
    await waitFor(() => expect(rendered.result.current.state.status).toBe(PROJECT_STATUS.ready));
    return rendered;
};

beforeEach(() => jest.clearAllMocks());

describe('useProjectGraph setPinned', () => {
    test('pins optimistically, sends the mixed PUT and reconciles both lists', async () => {
        const request = deferred();
        api.put.mockReturnValue(request.promise);
        const { result } = await renderLoaded();

        let pending;
        act(() => {
            pending = result.current.setPinned({ todoIds: [1], sequenceIds: [100] }, true);
        });

        expect(result.current.state.sequences[100].isPinned).toBe(true);
        expect(result.current.state.todos[1].isPinned).toBe(true);
        expect(api.put).toHaveBeenCalledWith('/projects/1/pins', {
            todoIds: [1], sequenceIds: [100], isPinned: true,
        });

        await act(async () => {
            request.resolve({
                todos: [{ id: 1, isPinned: true, pinnedAt: 't' }],
                sequences: [{ id: 100, isPinned: true, pinnedAt: 's' }],
            });
            await pending;
        });

        expect(result.current.state.todos[1].pinnedAt).toBe('t');
        expect(result.current.state.sequences[100].pinnedAt).toBe('s');
    });

    test('defaults a missing list to empty and leaves todos alone when pinning a sequence', async () => {
        api.put.mockResolvedValue({ todos: [], sequences: [{ id: 101, isPinned: true }] });
        const { result } = await renderLoaded();

        await act(async () => {
            await result.current.setPinned({ sequenceIds: [101] }, true);
        });

        expect(api.put).toHaveBeenCalledWith('/projects/1/pins', {
            todoIds: [], sequenceIds: [101], isPinned: true,
        });
        expect(result.current.state.sequences[101].isPinned).toBe(true);
        expect(result.current.state.todos[1].isPinned).toBe(false);
    });

    test('a failed request rolls back both todos and sequences', async () => {
        api.put.mockRejectedValue(new Error('nope'));
        const { result } = await renderLoaded();

        await act(async () => {
            await result.current.setPinned({ todoIds: [1], sequenceIds: [100] }, true);
        });

        expect(result.current.state.sequences[100].isPinned).toBe(false);
        expect(result.current.state.todos[1].isPinned).toBe(false);
        expect(result.current.state.actionError).toBe('nope');
    });

    test('overlapping pins keep the successful sequence pin when the other fails', async () => {
        const first = deferred();
        const second = deferred();
        api.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { result } = await renderLoaded();

        let a;
        let b;
        act(() => {
            a = result.current.setPinned({ sequenceIds: [100] }, true);
            b = result.current.setPinned({ sequenceIds: [101] }, true);
        });
        await act(async () => {
            first.reject(new Error('nope'));
            await a;
        });
        await act(async () => {
            second.resolve({ todos: [], sequences: [{ id: 101, isPinned: true }] });
            await b;
        });

        expect(result.current.state.sequences[100].isPinned).toBe(false);
        expect(result.current.state.sequences[101].isPinned).toBe(true);
    });

    test('overlapping pin then unpin of the same sequence replays in order', async () => {
        const first = deferred();
        const second = deferred();
        api.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { result } = await renderLoaded();

        let a;
        let b;
        act(() => {
            a = result.current.setPinned({ sequenceIds: [100] }, true);
            b = result.current.setPinned({ sequenceIds: [100] }, false);
        });
        await act(async () => {
            second.resolve({ todos: [], sequences: [{ id: 100, isPinned: false }] });
            await b;
        });
        await act(async () => {
            first.resolve({ todos: [], sequences: [{ id: 100, isPinned: true }] });
            await a;
        });

        expect(result.current.state.sequences[100].isPinned).toBe(false);
    });

    test('setTodosPinned still sends the todo-only request', async () => {
        api.put.mockResolvedValue({ todos: [{ id: 1, isPinned: true }] });
        const { result } = await renderLoaded();

        await act(async () => {
            await result.current.setTodosPinned([1], true);
        });

        expect(api.put).toHaveBeenCalledWith('/projects/1/todos/pins', { todoIds: [1], isPinned: true });
    });
});
