import { renderHook, act, waitFor } from '@testing-library/react';

import useReminders from './useReminders';
import { api } from '../lib/api';

jest.mock('../lib/api');

const A = { id: 1, title: 'A' };
const B = { id: 2, title: 'B' };

const mountReady = async (props = {}) => {
    api.get.mockResolvedValue({ reminders: [A, B] });
    const hook = renderHook((p) => useReminders(p), { initialProps: props });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useReminders', () => {
    it.each([
        [{}, '/reminders'],
        [{ placeId: 3 }, '/reminders?placeId=3'],
        [{ placeId: 'none', status: 'history', sort: 'created' }, '/reminders?placeId=none&status=history&sort=created'],
        [{ status: 'snoozed' }, '/reminders?status=snoozed'],
    ])('loads %j from %s with only the set params', async (props, path) => {
        const { result } = await mountReady(props);
        expect(api.get).toHaveBeenCalledWith(path);
        expect(result.current.reminders).toEqual([A, B]);
        expect(result.current.error).toBeNull();
    });

    it('starts loading and sets error when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useReminders({}));
        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
        expect(result.current.reminders).toEqual([]);
    });

    it('refetches when a param changes', async () => {
        const { result, rerender } = await mountReady({ status: 'open' });
        api.get.mockResolvedValue({ reminders: [B] });
        rerender({ status: 'history' });
        await waitFor(() => expect(result.current.reminders).toEqual([B]));
        expect(api.get).toHaveBeenLastCalledWith('/reminders?status=history');
    });

    it('ignores a response from an older query', async () => {
        let resolveOld;
        api.get.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
        const { result, rerender } = renderHook((p) => useReminders(p), { initialProps: { status: 'open' } });
        api.get.mockResolvedValue({ reminders: [B] });
        rerender({ status: 'all' });
        await waitFor(() => expect(result.current.status).toBe('ready'));
        await act(async () => resolveOld({ reminders: [A] }));
        expect(result.current.reminders).toEqual([B]);
    });

    it.each([
        ['add', 'post', '/reminders', { title: 'N' }, (r) => r.add({ title: 'N' })],
        ['edit', 'patch', '/reminders/1', { title: 'N' }, (r) => r.edit(1, { title: 'N' })],
        ['remove', 'delete', '/reminders/1', undefined, (r) => r.remove(1)],
        ['done', 'post', '/reminders/1/done', undefined, (r) => r.done(1)],
        ['dismiss', 'post', '/reminders/1/dismiss', undefined, (r) => r.dismiss(1)],
        ['reopen', 'post', '/reminders/1/reopen', undefined, (r) => r.reopen(1)],
        ['snooze', 'post', '/reminders/1/snooze', { until: '2026-10-23T15:00:00Z' }, (r) => r.snooze(1, '2026-10-23T15:00:00Z')],
    ])('%s calls the endpoint then reloads with the current query', async (_n, verb, path, body, call) => {
        const { result } = await mountReady({ placeId: 3 });
        api[verb].mockResolvedValue({});
        api.get.mockResolvedValue({ reminders: [B] });

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        if (body === undefined) expect(api[verb]).toHaveBeenCalledWith(path);
        else expect(api[verb]).toHaveBeenCalledWith(path, body);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(api.get).toHaveBeenLastCalledWith('/reminders?placeId=3');
        expect(result.current.reminders).toEqual([B]);
        expect(outcome).toBe(true);
    });

    it('a failed action keeps the list, sets error and resolves false', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValue(new Error('nope'));

        let outcome;
        await act(async () => {
            outcome = await result.current.done(1);
        });

        expect(outcome).toBe(false);
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(result.current.reminders).toEqual([A, B]);
        expect(result.current.error).toBe('nope');
        expect(result.current.status).toBe('ready');
    });

    it('reload clears error and refetches', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValue(new Error('nope'));
        await act(() => result.current.done(1));
        api.get.mockResolvedValue({ reminders: [A] });
        await act(() => result.current.reload());
        expect(result.current.error).toBeNull();
        expect(result.current.reminders).toEqual([A]);
    });

    it('does not update state after unmount', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let resolve;
        api.get.mockReturnValue(new Promise((r) => { resolve = r; }));
        const { unmount } = renderHook(() => useReminders({}));
        unmount();
        await act(async () => resolve({ reminders: [A] }));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
