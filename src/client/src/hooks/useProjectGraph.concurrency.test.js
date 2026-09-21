import { act, renderHook, waitFor } from '@testing-library/react';
import { api } from '../lib/api';
import useProjectGraph from './useProjectGraph';
import { cascadeTodoMove, cascadeTodoRemoval } from '../state/cascades';

jest.mock('../lib/api', () => ({ api: {
    get: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), post: jest.fn(),
} }));
const todo = { id: 1, projectId: 1, text: 'Work', status: 'incomplete', isPinned: false };
const graph = { project: { id: 1 }, layers: [], sequences: [], todos: [todo] };
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const setup = async (initialGraph = graph) => {
    api.get.mockResolvedValue(initialGraph);
    const view = renderHook(({ id }) => useProjectGraph(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(view.result.current.state.status).toBe('ready'));
    return view;
};
beforeEach(() => jest.resetAllMocks());

test.each(['resolve', 'reject'])('older pin %s preserves a newer completion', async (settle) => {
    const { result } = await setup();
    const pending = deferred();
    api.put.mockReturnValue(pending.promise);
    act(() => { result.current.setTodosPinned([1], true); });
    api.patch.mockResolvedValue({ ...todo, isPinned: true, status: 'complete' });
    await act(async () => result.current.updateEntity('todos', 1, {
        path: '/todos/1', changes: { status: 'complete' },
    }));
    await act(async () => pending[settle](settle === 'resolve'
        ? { todos: [{ ...todo, isPinned: true }] } : new Error('Pin failed')));
    expect(result.current.state.todos[1].status).toBe('complete');
    expect(result.current.state.todos[1].isPinned).toBe(settle === 'resolve');
    expect(result.current.state.actionError).toBe(settle === 'reject' ? 'Pin failed' : null);
});

test('older pin success does not resurrect a deleted row or throw', async () => {
    const { result } = await setup();
    const pending = deferred();
    api.put.mockReturnValue(pending.promise);
    act(() => { result.current.setTodosPinned([1], true); });
    api.delete.mockResolvedValue({ id: 1 });
    await act(async () => result.current.removeEntity('todos', 1, { path: '/todos/1' }));
    await act(async () => pending.resolve({ todos: [{ ...todo, isPinned: true }] }));
    expect(result.current.state.todos[1]).toBeUndefined();
});

test.each(['resolve', 'reject'])('ignores pin %s after navigating away and back', async (settle) => {
    const { result, rerender } = await setup();
    const pending = deferred();
    api.put.mockReturnValue(pending.promise);
    act(() => { result.current.setTodosPinned([1], true); });
    api.get.mockResolvedValue({ ...graph, project: { id: 2 }, todos: [] });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.state.project.id).toBe(2));
    api.get.mockResolvedValue(graph);
    rerender({ id: 1 });
    await waitFor(() => expect(result.current.state.project.id).toBe(1));
    await act(async () => pending[settle](settle === 'resolve'
        ? { todos: [{ ...todo, isPinned: true }] } : new Error('Old failure')));
    expect(result.current.state.todos[1]).toEqual(todo);
    expect(result.current.state.actionError).toBeNull();
});

test.each([true, false])('two failed overlapping pins restore the original value (oldest first=%s)', async (oldestFirst) => {
    const { result } = await setup();
    const first = deferred(), second = deferred();
    api.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => { result.current.setTodosPinned([1], true); });
    act(() => { result.current.setTodosPinned([1], false); });
    const order = oldestFirst ? [first, second] : [second, first];
    await act(async () => order[0].reject(new Error('First failure')));
    await act(async () => order[1].reject(new Error('Second failure')));
    expect(result.current.state.todos[1].isPinned).toBe(false);
});

test('keeps a newer pending completion when pin succeeds, then rolls back only the failed completion', async () => {
    const { result } = await setup();
    const pin = deferred(), completion = deferred();
    api.put.mockReturnValue(pin.promise);
    api.patch.mockReturnValue(completion.promise);
    act(() => { result.current.setTodosPinned([1], true); });
    act(() => { result.current.updateEntity('todos', 1, {
        path: '/todos/1', changes: { status: 'complete' },
    }); });
    await act(async () => pin.resolve({ todos: [{ ...todo, isPinned: true }] }));
    expect(result.current.state.todos[1].status).toBe('complete');
    await act(async () => completion.reject(new Error('Completion failed')));
    expect(result.current.state.todos[1]).toEqual({ ...todo, isPinned: true });
    expect(result.current.state.actionError).toBe('Completion failed');
});

test('a newer successful pin keeps its intent when an identical older pin fails', async () => {
    const { result } = await setup();
    const first = deferred(), second = deferred();
    api.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => { result.current.setTodosPinned([1], true); });
    act(() => { result.current.setTodosPinned([1], true); });
    await act(async () => second.resolve({ todos: [{ ...todo, isPinned: true }] }));
    await act(async () => first.reject(new Error('First failed')));
    expect(result.current.state.todos[1].isPinned).toBe(true);
});

test.each(['resolve', 'reject'])('older pin %s preserves an unrelated created row', async (settle) => {
    const { result } = await setup();
    const pending = deferred();
    api.put.mockReturnValue(pending.promise);
    act(() => { result.current.setTodosPinned([1], true); });
    api.post.mockResolvedValue({ ...todo, id: 2 });
    await act(async () => result.current.createEntity('todos', {
        path: '/projects/1/todos', optimistic: todo,
    }));
    const created = result.current.state.todos[2];
    await act(async () => pending[settle](settle === 'resolve'
        ? { todos: [{ ...todo, isPinned: true }] } : new Error('Pin failed')));
    expect(result.current.state.todos[2]).toEqual(created);
});

test('create then pin preserves the row clientKey', async () => {
    const { result } = await setup();
    api.post.mockResolvedValue({ ...todo, id: 2 });
    await act(async () => result.current.createEntity('todos', {
        path: '/projects/1/todos', optimistic: { ...todo, id: undefined },
    }));
    const key = result.current.state.todos[2].clientKey;
    expect(key).toBeLessThan(0);
    api.put.mockResolvedValue({ todos: [{ ...todo, id: 2, isPinned: true }] });
    await act(async () => result.current.setTodosPinned([2], true));
    expect(result.current.state.todos[2].clientKey).toBe(key);
});


test.each([true, false])('failed delete and successful reorder reconcile server positions (delete settles first=%s)', async (deleteFirst) => {
    const todos = [0, 1, 2].map((position) => ({
        ...todo, id: position + 1, sequenceId: null, position, clientKey: -position - 1,
    }));
    const { result } = await setup({ ...graph, todos });
    const deletion = deferred(), move = deferred();
    api.delete.mockReturnValue(deletion.promise);
    api.put.mockReturnValue(move.promise);
    act(() => { result.current.removeEntity('todos', 1, {
        path: '/todos/1', also: cascadeTodoRemoval(result.current.state, 1),
    }); });
    const placement = { sequenceId: null, position: 0 };
    act(() => { result.current.updateEntity('todos', 3, {
        path: '/todos/3/move', method: 'put', changes: placement,
        also: cascadeTodoMove(result.current.state, 3, placement),
    }); });
    const authoritative = todos.map(({ clientKey, ...row }) => ({
        ...row, position: row.id === 3 ? 0 : row.id,
    }));
    api.get.mockResolvedValue({ ...graph, todos: authoritative });
    const failDelete = () => deletion.reject(new Error('Delete failed'));
    const saveMove = () => move.resolve(authoritative[2]);
    await act(async () => (deleteFirst ? failDelete : saveMove)());
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => (deleteFirst ? saveMove : failDelete)());
    expect(Object.values(result.current.state.todos).map((row) => row.position)).toEqual([1, 2, 0]);
    expect(result.current.state.todos[3].clientKey).toBe(-3);
    expect(result.current.state.actionError).toBe('Delete failed');
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledTimes(1);
});

test.each([true, false])('reopening clears the completion timestamp (completion settles first=%s)', async (completeFirst) => {
    const initialTodo = { ...todo, completedAt: null };
    const { result } = await setup({ ...graph, todos: [initialTodo] });
    const completion = deferred(), reopening = deferred();
    api.patch.mockReturnValueOnce(completion.promise).mockReturnValueOnce(reopening.promise);
    act(() => { result.current.updateEntity('todos', 1, {
        path: '/todos/1', changes: { status: 'complete' },
    }); });
    act(() => { result.current.updateEntity('todos', 1, {
        path: '/todos/1', changes: { status: 'incomplete' },
    }); });
    const complete = () => completion.resolve({
        ...initialTodo, status: 'complete', completedAt: '2026-09-18T12:00:00.000Z',
    });
    const reopen = () => reopening.resolve(initialTodo);
    await act(async () => (completeFirst ? complete : reopen)());
    expect(result.current.state.todos[1]).toMatchObject({ status: 'incomplete', completedAt: null });
    await act(async () => (completeFirst ? reopen : complete)());
    expect(result.current.state.todos[1]).toEqual(initialTodo);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledTimes(2);
});

const setupPendingReconciliation = async () => {
    const view = await setup({ ...graph, todos: [todo, { ...todo, id: 2 }] });
    const read = deferred();
    api.get.mockReturnValueOnce(read.promise);
    api.delete.mockResolvedValue({});
    act(() => {
        view.result.current.removeEntity('todos', 1, { path: '/todos/1' });
        view.result.current.removeEntity('todos', 2, { path: '/todos/2' });
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    return { ...view, read };
};

test('blocks writes during authoritative reconciliation and surfaces a failed read with retry', async () => {
    const { result, read } = await setupPendingReconciliation();
    expect(result.current.state.status).toBe('loading');
    await act(async () => result.current.updateProject({ description: 'Not sent' }));
    expect(api.patch).not.toHaveBeenCalled();
    await act(async () => read.reject(new Error('Reconciliation unavailable')));
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.loadError).toBe('Reconciliation unavailable');
    api.get.mockResolvedValue({ ...graph, todos: [] });
    await act(async () => result.current.reload());
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.todos).toEqual({});
});

test.each(['resolve', 'reject'])('ignores authoritative read %s after navigation away and back', async (settle) => {
    const { result, rerender, read } = await setupPendingReconciliation();
    api.get.mockResolvedValue({ ...graph, project: { id: 2 }, todos: [] });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.state.project.id).toBe(2));
    api.get.mockResolvedValue(graph);
    rerender({ id: 1 });
    await waitFor(() => expect(result.current.state.project.id).toBe(1));
    await act(async () => read[settle](settle === 'resolve'
        ? { ...graph, todos: [] } : new Error('Obsolete read')));
    expect(result.current.state.todos[1]).toEqual(todo);
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.loadError).toBeNull();
});

test('waits for newer pending pins before reading the authoritative graph', async () => {
    const { result } = await setup({ ...graph, todos: [todo, { ...todo, id: 2 }, { ...todo, id: 3 }] });
    const pin = deferred();
    api.delete.mockResolvedValue({});
    api.put.mockReturnValue(pin.promise);
    act(() => {
        result.current.removeEntity('todos', 1, { path: '/todos/1' });
        result.current.removeEntity('todos', 2, { path: '/todos/2' });
        result.current.setTodosPinned([3], true);
    });
    await act(async () => {});
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(result.current.state.todos[3].isPinned).toBe(true);
    const saved = { ...todo, id: 3, isPinned: true };
    api.get.mockResolvedValue({ ...graph, todos: [saved] });
    await act(async () => pin.resolve({ todos: [saved] }));
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(result.current.state.todos).toEqual({ 3: saved });
});
