import { renderHook, act, waitFor } from '@testing-library/react';

import useChores from './useChores';
import { api } from '../lib/api';

jest.mock('../lib/api');

const A = { id: 1, name: 'A', status: 'due' };
const B = { id: 2, name: 'B', status: 'never' };
const A2 = { id: 1, name: 'A', status: 'upcoming' };
const LOG = { id: 90, choreId: 1, on: '2026-10-20', by: 'Jacklin' };

const mountReady = async () => {
    api.get.mockResolvedValue({ chores: [A, B] });
    const hook = renderHook(() => useChores());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useChores', () => {
    it('starts loading, then loads GET /chores', async () => {
        api.get.mockResolvedValue({ chores: [A, B] });
        const { result } = renderHook(() => useChores());
        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith('/chores');
        expect(result.current.chores).toEqual([A, B]);
        expect(result.current.error).toBeNull();
    });

    it('sets error status when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useChores());
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
        expect(result.current.chores).toEqual([]);
    });

    it('only the newest request updates state', async () => {
        let resolveOld;
        api.get.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
        const { result } = renderHook(() => useChores());
        api.get.mockResolvedValue({ chores: [B] });
        await act(() => result.current.reload());
        await act(async () => resolveOld({ chores: [A] }));
        expect(result.current.chores).toEqual([B]);
        expect(result.current.status).toBe('ready');
    });

    it.each([
        ['add', 'post', '/chores', { name: 'N' }, (r) => r.add({ name: 'N' })],
        ['edit', 'patch', '/chores/1', { name: 'N' }, (r) => r.edit(1, { name: 'N' })],
    ])('%s calls the endpoint, reloads and resolves true', async (_n, verb, path, body, call) => {
        const { result } = await mountReady();
        api[verb].mockResolvedValue({});
        api.get.mockResolvedValue({ chores: [B] });
        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });
        expect(api[verb]).toHaveBeenCalledWith(path, body);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.chores).toEqual([B]);
        expect(outcome).toBe(true);
    });

    it.each([
        ['add', 'post', (r) => r.add({ name: 'N' })],
        ['edit', 'patch', (r) => r.edit(1, { name: 'N' })],
        ['undo', 'delete', (r) => r.undo(1, 90)],
    ])('a failed %s keeps the list, sets error and resolves false', async (_n, verb, call) => {
        const { result } = await mountReady();
        api[verb].mockRejectedValue(new Error('nope'));
        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });
        expect(outcome).toBe(false);
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(result.current.chores).toEqual([A, B]);
        expect(result.current.error).toBe('nope');
        expect(result.current.status).toBe('ready');
    });

    it('markDone posts { by }, resolves the log and reloads', async () => {
        const { result } = await mountReady();
        api.post.mockResolvedValue({ log: LOG, chore: A2 });
        api.get.mockResolvedValue({ chores: [B, A2] });
        let outcome;
        await act(async () => {
            outcome = await result.current.markDone(1, 'Jacklin');
        });
        expect(api.post).toHaveBeenCalledWith('/chores/1/done', { by: 'Jacklin' });
        expect(outcome).toEqual(LOG);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.chores).toEqual([B, A2]);
    });

    it('markDone does not mutate the previous list', async () => {
        const { result } = await mountReady();
        const before = result.current.chores;
        api.post.mockResolvedValue({ log: LOG, chore: A2 });
        api.get.mockReturnValue(new Promise(() => {}));
        await act(async () => {
            result.current.markDone(1, 'Justin');
        });
        expect(before).toEqual([A, B]);
        expect(result.current.chores).toEqual([A2, B]);
    });

    it('a failed markDone resolves null, sets error and keeps the list', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValue(new Error('archived'));
        let outcome;
        await act(async () => {
            outcome = await result.current.markDone(1, 'Justin');
        });
        expect(outcome).toBeNull();
        expect(result.current.error).toBe('archived');
        expect(result.current.chores).toEqual([A, B]);
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('undo deletes the log, reloads and resolves true', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({ id: 90, chore: A });
        api.get.mockResolvedValue({ chores: [A] });
        let outcome;
        await act(async () => {
            outcome = await result.current.undo(1, 90);
        });
        expect(api.delete).toHaveBeenCalledWith('/chores/1/logs/90');
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.chores).toEqual([A]);
        expect(outcome).toBe(true);
    });

    it('does not update state after unmount', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let resolve;
        api.get.mockReturnValue(new Promise((r) => { resolve = r; }));
        const { unmount } = renderHook(() => useChores());
        unmount();
        await act(async () => resolve({ chores: [A] }));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
