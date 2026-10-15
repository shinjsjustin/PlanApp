import { renderHook, act, waitFor } from '@testing-library/react';

import useThoughts from './useThoughts';
import { api } from '../lib/api';

jest.mock('../lib/api');

const A = { id: 1, text: 'first', createdAt: '2026-01-01T00:00:00.000Z' };
const B = { id: 2, text: 'second', createdAt: '2026-01-02T00:00:00.000Z' };

const mountReady = async (thoughts = [B, A]) => {
    api.get.mockResolvedValue({ thoughts });
    const hook = renderHook(() => useThoughts());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useThoughts', () => {
    it('loads GET /thoughts: loading, then ready with the list', async () => {
        api.get.mockResolvedValue({ thoughts: [B, A] });
        const { result } = renderHook(() => useThoughts());

        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith('/thoughts');
        expect(result.current.thoughts).toEqual([B, A]);
        expect(result.current.error).toBeNull();
    });

    it('sets status error with the message when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useThoughts());

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
        expect(result.current.thoughts).toEqual([]);
    });

    it('add POSTs and puts the returned thought first', async () => {
        const C = { id: 3, text: 'third', createdAt: '2026-01-03T00:00:00.000Z' };
        const { result } = await mountReady();
        api.post.mockResolvedValue(C);

        await act(() => result.current.add('third'));

        expect(api.post).toHaveBeenCalledWith('/thoughts', { text: 'third' });
        expect(result.current.thoughts).toEqual([C, B, A]);
    });

    it('edit PATCHes and replaces the thought in place', async () => {
        const edited = { ...A, text: 'changed' };
        const { result } = await mountReady();
        api.patch.mockResolvedValue(edited);

        await act(() => result.current.edit(1, 'changed'));

        expect(api.patch).toHaveBeenCalledWith('/thoughts/1', { text: 'changed' });
        expect(result.current.thoughts).toEqual([B, edited]);
    });

    it('remove DELETEs /thoughts/:id and drops the thought', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({ id: 2 });

        await act(() => result.current.remove(2));

        expect(api.delete).toHaveBeenCalledWith('/thoughts/2');
        expect(result.current.thoughts).toEqual([A]);
    });

    it('clearAll DELETEs /thoughts and empties the list', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({ deleted: 2 });

        await act(() => result.current.clearAll());

        expect(api.delete).toHaveBeenCalledWith('/thoughts');
        expect(result.current.thoughts).toEqual([]);
    });

    it.each([
        ['add', 'post', (r) => r.add('x')],
        ['edit', 'patch', (r) => r.edit(1, 'x')],
        ['remove', 'delete', (r) => r.remove(1)],
        ['clearAll', 'delete', (r) => r.clearAll()],
    ])('a failed %s leaves the list and sets error', async (_n, verb, call) => {
        const { result } = await mountReady();
        api[verb].mockRejectedValue(new Error('nope'));

        await act(() => call(result.current));

        expect(result.current.thoughts).toEqual([B, A]);
        expect(result.current.error).toBe('nope');
        expect(result.current.status).toBe('ready');
    });

    it.each([
        ['add', 'post', { id: 3, text: 'x', createdAt: 'z' }, (r) => r.add('x')],
        ['edit', 'patch', { ...A, text: 'x' }, (r) => r.edit(1, 'x')],
        ['remove', 'delete', { id: 1 }, (r) => r.remove(1)],
        ['clearAll', 'delete', { deleted: 2 }, (r) => r.clearAll()],
    ])('%s resolves true on success', async (_n, verb, reply, call) => {
        const { result } = await mountReady();
        api[verb].mockResolvedValue(reply);

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        expect(outcome).toBe(true);
    });

    it.each([
        ['add', 'post', (r) => r.add('x')],
        ['edit', 'patch', (r) => r.edit(1, 'x')],
        ['remove', 'delete', (r) => r.remove(1)],
        ['clearAll', 'delete', (r) => r.clearAll()],
    ])('%s resolves false without throwing when the call fails', async (_n, verb, call) => {
        const { result } = await mountReady();
        api[verb].mockRejectedValue(new Error('nope'));

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        expect(outcome).toBe(false);
        expect(result.current.thoughts).toEqual([B, A]);
        expect(result.current.error).toBe('nope');
    });

    it('clears error on the next successful call', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValueOnce(new Error('nope'));
        await act(() => result.current.add('x'));
        expect(result.current.error).toBe('nope');

        api.post.mockResolvedValue({ id: 3, text: 'x', createdAt: 'z' });
        await act(() => result.current.add('x'));

        expect(result.current.error).toBeNull();
    });

    it('does not update state after unmount', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let resolve;
        api.get.mockReturnValue(new Promise((r) => { resolve = r; }));
        const { unmount } = renderHook(() => useThoughts());
        unmount();
        await act(async () => resolve({ thoughts: [A] }));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
