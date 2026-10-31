import { renderHook, act, waitFor } from '@testing-library/react';

import useChoreLogs from './useChoreLogs';
import { api } from '../lib/api';

jest.mock('../lib/api');

const L1 = { id: 90, choreId: 7, on: '2026-10-20', by: 'Jacklin' };
const L2 = { id: 91, choreId: 7, on: '2026-10-10', by: 'Justin' };

const mountReady = async (logs = [L1, L2]) => {
    api.get.mockResolvedValue({ logs });
    const hook = renderHook(() => useChoreLogs(7));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useChoreLogs', () => {
    it('starts loading, then loads GET /chores/:id/logs', async () => {
        api.get.mockResolvedValue({ logs: [L1, L2] });
        const { result } = renderHook(() => useChoreLogs(7));
        expect(result.current.status).toBe('loading');
        expect(result.current.logs).toEqual([]);
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith('/chores/7/logs');
        expect(result.current.logs).toEqual([L1, L2]);
        expect(result.current.error).toBeNull();
    });

    it('sets error status when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useChoreLogs(7));
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
    });

    it('uses generic text when the failure has no message', async () => {
        api.get.mockRejectedValue({});
        const { result } = renderHook(() => useChoreLogs(7));
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('Something went wrong. Please try again.');
    });

    it('add posts done with { on, by }, reloads and resolves true', async () => {
        const { result } = await mountReady([L1]);
        api.post.mockResolvedValue({});
        api.get.mockResolvedValue({ logs: [L1, L2] });
        let ok;
        await act(async () => {
            ok = await result.current.add({ on: '2026-10-10', by: 'Justin' });
        });
        expect(ok).toBe(true);
        expect(api.post).toHaveBeenCalledWith('/chores/7/done', { on: '2026-10-10', by: 'Justin' });
        expect(result.current.logs).toEqual([L1, L2]);
    });

    it('edit patches the log, reloads and resolves true', async () => {
        const { result } = await mountReady();
        api.patch.mockResolvedValue({});
        api.get.mockResolvedValue({ logs: [{ ...L1, by: 'Mom' }, L2] });
        let ok;
        await act(async () => {
            ok = await result.current.edit(90, { by: 'Mom' });
        });
        expect(ok).toBe(true);
        expect(api.patch).toHaveBeenCalledWith('/chores/7/logs/90', { by: 'Mom' });
        expect(result.current.logs[0].by).toBe('Mom');
    });

    it('remove deletes the log, reloads and resolves true', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({});
        api.get.mockResolvedValue({ logs: [L2] });
        let ok;
        await act(async () => {
            ok = await result.current.remove(90);
        });
        expect(ok).toBe(true);
        expect(api.delete).toHaveBeenCalledWith('/chores/7/logs/90');
        expect(result.current.logs).toEqual([L2]);
    });

    it('resolves false, sets error and keeps logs when an action fails', async () => {
        const { result } = await mountReady();
        api.delete.mockRejectedValue(new Error('nope'));
        api.get.mockClear();
        let ok;
        await act(async () => {
            ok = await result.current.remove(90);
        });
        expect(ok).toBe(false);
        expect(result.current.error).toBe('nope');
        expect(result.current.logs).toEqual([L1, L2]);
        expect(api.get).not.toHaveBeenCalled();
    });

    it('lets only the newest load update state', async () => {
        const { result } = await mountReady();
        let resolveSlow;
        api.get.mockReturnValueOnce(new Promise((r) => { resolveSlow = r; }));
        api.get.mockResolvedValueOnce({ logs: [L2] });
        let slow;
        await act(async () => {
            slow = result.current.reload();
            await result.current.reload();
        });
        await act(async () => {
            resolveSlow({ logs: [L1] });
            await slow;
        });
        expect(result.current.logs).toEqual([L2]);
    });

    it('does not update state after unmount', async () => {
        let resolveGet;
        api.get.mockReturnValue(new Promise((r) => { resolveGet = r; }));
        const { result, unmount } = renderHook(() => useChoreLogs(7));
        unmount();
        await act(async () => {
            resolveGet({ logs: [L1] });
        });
        expect(result.current.status).toBe('loading');
        expect(result.current.logs).toEqual([]);
    });
});
