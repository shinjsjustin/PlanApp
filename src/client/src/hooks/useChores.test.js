import { renderHook, act, waitFor } from '@testing-library/react';

import useChores from './useChores';
import { api } from '../lib/api';

jest.mock('../lib/api');

const A = { id: 1, name: 'A', status: 'due' };
const B = { id: 2, name: 'B', status: 'never' };
const A2 = { id: 1, name: 'A', status: 'upcoming' };
const LOG = { id: 90, choreId: 1, on: '2026-10-20', by: 'Jacklin' };

const C = { id: 3, name: 'C', status: 'never' };

// Answers GET /chores with `active` and GET /chores?archived=true with `archived`.
const mockLists = (active, archived = []) => {
    api.get.mockImplementation(async (path) => ({
        chores: path === '/chores?archived=true' ? archived : active,
    }));
};

const mountReady = async () => {
    mockLists([A, B], [C]);
    const hook = renderHook(() => useChores());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useChores', () => {
    it('starts loading, then loads GET /chores', async () => {
        mockLists([A, B], [C]);
        const { result } = renderHook(() => useChores());
        expect(result.current.status).toBe('loading');
        expect(result.current.archived).toEqual([]);
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith('/chores');
        expect(api.get).toHaveBeenCalledWith('/chores?archived=true');
        expect(result.current.chores).toEqual([A, B]);
        expect(result.current.archived).toEqual([C]);
        expect(result.current.error).toBeNull();
    });

    it('sets error status when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useChores());
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
        expect(result.current.chores).toEqual([]);
    });

    it('keeps both lists and sets error when only the archived load fails', async () => {
        const { result } = await mountReady();
        api.get.mockImplementation(async (path) => {
            if (path === '/chores?archived=true') throw new Error('archived down');
            return { chores: [B] };
        });
        await act(() => result.current.reload());
        expect(result.current.error).toBe('archived down');
        expect(result.current.chores).toEqual([A, B]);
        expect(result.current.archived).toEqual([C]);
    });

    it('only the newest request updates state', async () => {
        let resolveOld;
        api.get.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
        api.get.mockResolvedValueOnce({ chores: [C] });
        const { result } = renderHook(() => useChores());
        mockLists([B], [C]);
        await act(() => result.current.reload());
        await act(async () => resolveOld({ chores: [A] }));
        expect(result.current.chores).toEqual([B]);
        expect(result.current.archived).toEqual([C]);
        expect(result.current.status).toBe('ready');
    });

    it.each([
        ['add', 'post', '/chores', { name: 'N' }, (r) => r.add({ name: 'N' })],
        ['edit', 'patch', '/chores/1', { name: 'N' }, (r) => r.edit(1, { name: 'N' })],
        ['archive', 'post', '/chores/1/archive', undefined, (r) => r.archive(1)],
        ['restore', 'post', '/chores/3/restore', undefined, (r) => r.restore(3)],
        ['seed', 'post', '/chores/seed', undefined, (r) => r.seed()],
    ])('%s calls the endpoint, reloads and resolves true', async (_n, verb, path, body, call) => {
        const { result } = await mountReady();
        api[verb].mockResolvedValue({});
        mockLists([B], [A]);
        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });
        if (body === undefined) expect(api[verb]).toHaveBeenCalledWith(path);
        else expect(api[verb]).toHaveBeenCalledWith(path, body);
        expect(api.get).toHaveBeenCalledTimes(4);
        expect(result.current.chores).toEqual([B]);
        expect(result.current.archived).toEqual([A]);
        expect(outcome).toBe(true);
    });

    it.each([
        ['add', 'post', (r) => r.add({ name: 'N' })],
        ['edit', 'patch', (r) => r.edit(1, { name: 'N' })],
        ['undo', 'delete', (r) => r.undo(1, 90)],
        ['archive', 'post', (r) => r.archive(1)],
        ['restore', 'post', (r) => r.restore(3)],
        ['seed', 'post', (r) => r.seed()],
    ])('a failed %s keeps the list, sets error and resolves false', async (_n, verb, call) => {
        const { result } = await mountReady();
        api[verb].mockRejectedValue(new Error('nope'));
        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });
        expect(outcome).toBe(false);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.chores).toEqual([A, B]);
        expect(result.current.archived).toEqual([C]);
        expect(result.current.error).toBe('nope');
        expect(result.current.status).toBe('ready');
    });

    it('markDone posts { by }, resolves the log and reloads', async () => {
        const { result } = await mountReady();
        api.post.mockResolvedValue({ log: LOG, chore: A2 });
        mockLists([B, A2]);
        let outcome;
        await act(async () => {
            outcome = await result.current.markDone(1, 'Jacklin');
        });
        expect(api.post).toHaveBeenCalledWith('/chores/1/done', { by: 'Jacklin' });
        expect(outcome).toEqual(LOG);
        expect(api.get).toHaveBeenCalledTimes(4);
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
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('undo deletes the log, reloads and resolves true', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({ id: 90, chore: A });
        mockLists([A]);
        let outcome;
        await act(async () => {
            outcome = await result.current.undo(1, 90);
        });
        expect(api.delete).toHaveBeenCalledWith('/chores/1/logs/90');
        expect(api.get).toHaveBeenCalledTimes(4);
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
