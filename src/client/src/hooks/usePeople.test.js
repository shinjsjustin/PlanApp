import { renderHook, act, waitFor } from '@testing-library/react';

import usePeople from './usePeople';
import { api } from '../lib/api';

jest.mock('../lib/api');

const ANN = { id: 1, name: 'Ann', placeId: 1 };
const BOB = { id: 2, name: 'Bob', placeId: null };

const mountReady = async (payload = { people: [ANN, BOB] }) => {
    api.get.mockResolvedValue(payload);
    const hook = renderHook(() => usePeople());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('usePeople', () => {
    it('loads GET /people: loading, then ready with people', async () => {
        api.get.mockResolvedValue({ people: [ANN, BOB] });
        const { result } = renderHook(() => usePeople());

        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith('/people');
        expect(result.current.people).toEqual([ANN, BOB]);
        expect(result.current.error).toBeNull();
    });

    it('sets status error with the message when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => usePeople());

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
        expect(result.current.people).toEqual([]);
    });

    it('uses a generic message when the load error has none', async () => {
        api.get.mockRejectedValue({});
        const { result } = renderHook(() => usePeople());

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('Something went wrong. Please try again.');
    });

    it.each([
        ['add', 'post', '/people', { name: 'N' }, (r) => r.add({ name: 'N' })],
        ['edit', 'patch', '/people/1', { name: 'N' }, (r) => r.edit(1, { name: 'N' })],
        ['remove', 'delete', '/people/1', undefined, (r) => r.remove(1)],
    ])('%s calls the API then reloads the list', async (_n, verb, path, body, call) => {
        const { result } = await mountReady();
        api[verb].mockResolvedValue({});
        api.get.mockResolvedValue({ people: [BOB] });

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        if (body === undefined) expect(api[verb]).toHaveBeenCalledWith(path);
        else expect(api[verb]).toHaveBeenCalledWith(path, body);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.people).toEqual([BOB]);
        expect(outcome).toBe(true);
    });

    it.each([
        ['add', 'post', (r) => r.add({ name: 'N' })],
        ['edit', 'patch', (r) => r.edit(1, { name: 'N' })],
        ['remove', 'delete', (r) => r.remove(1)],
    ])('a failed %s keeps the list, sets error and resolves false', async (_n, verb, call) => {
        const { result } = await mountReady();
        api[verb].mockRejectedValue(new Error('nope'));

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        expect(outcome).toBe(false);
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(result.current.people).toEqual([ANN, BOB]);
        expect(result.current.error).toBe('nope');
        expect(result.current.status).toBe('ready');
    });

    it('clears error on the next successful call', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValueOnce(new Error('nope'));
        await act(() => result.current.add({ name: 'N' }));
        expect(result.current.error).toBe('nope');

        api.post.mockResolvedValue({});
        api.get.mockResolvedValue({ people: [ANN] });
        await act(() => result.current.add({ name: 'N' }));

        expect(result.current.error).toBeNull();
    });

    it('reload re-fetches the list without going back to loading', async () => {
        const { result } = await mountReady();
        let resolve;
        api.get.mockReturnValue(new Promise((r) => { resolve = r; }));

        let pending;
        act(() => {
            pending = result.current.reload();
        });
        expect(result.current.status).toBe('ready');
        expect(api.get).toHaveBeenCalledTimes(2);

        await act(async () => {
            resolve({ people: [BOB] });
            await pending;
        });
        expect(result.current.status).toBe('ready');
        expect(result.current.people).toEqual([BOB]);
    });

    it('a failed reload keeps the list and sets error', async () => {
        const { result } = await mountReady();
        api.get.mockRejectedValue(new Error('flaky'));

        await act(() => result.current.reload());

        expect(result.current.people).toEqual([ANN, BOB]);
        expect(result.current.error).toBe('flaky');
        expect(result.current.status).toBe('ready');
    });

    it('does not update state after unmount', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let resolve;
        api.get.mockReturnValue(new Promise((r) => { resolve = r; }));
        const { unmount } = renderHook(() => usePeople());
        unmount();
        await act(async () => resolve({ people: [ANN] }));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
