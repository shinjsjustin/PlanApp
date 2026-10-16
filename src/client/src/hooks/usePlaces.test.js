import { renderHook, act, waitFor } from '@testing-library/react';

import usePlaces from './usePlaces';
import { api } from '../lib/api';

jest.mock('../lib/api');

const HOME = { id: 1, name: 'Home', address: '1 Main St', kind: 'home', notes: null, visitMinutes: null, isDefaultStart: false };
const SHOP = { id: 2, name: 'Shop', address: '2 Side St', kind: 'supplier', notes: 'ring bell', visitMinutes: 60, isDefaultStart: true };

const mountReady = async (payload = { places: [HOME, SHOP], startPlaceId: 2 }) => {
    api.get.mockResolvedValue(payload);
    const hook = renderHook(() => usePlaces());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('usePlaces', () => {
    it('loads GET /places: loading, then ready with places and startPlaceId', async () => {
        api.get.mockResolvedValue({ places: [HOME, SHOP], startPlaceId: 2 });
        const { result } = renderHook(() => usePlaces());

        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith('/places');
        expect(result.current.places).toEqual([HOME, SHOP]);
        expect(result.current.startPlaceId).toBe(2);
        expect(result.current.error).toBeNull();
    });

    it('sets status error with the message when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => usePlaces());

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
        expect(result.current.places).toEqual([]);
        expect(result.current.startPlaceId).toBeNull();
    });

    it.each([
        ['add', 'post', '/places', { name: 'N' }, (r) => r.add({ name: 'N' })],
        ['edit', 'patch', '/places/1', { name: 'N' }, (r) => r.edit(1, { name: 'N' })],
        ['remove', 'delete', '/places/1', undefined, (r) => r.remove(1)],
        ['setStart', 'patch', '/places/1', { isDefaultStart: true }, (r) => r.setStart(1)],
    ])('%s calls the API then reloads the list and startPlaceId', async (_n, verb, path, body, call) => {
        const { result } = await mountReady();
        const reloaded = { places: [HOME], startPlaceId: 1 };
        api[verb].mockResolvedValue({});
        api.get.mockResolvedValue(reloaded);

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        if (body === undefined) expect(api[verb]).toHaveBeenCalledWith(path);
        else expect(api[verb]).toHaveBeenCalledWith(path, body);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.places).toEqual([HOME]);
        expect(result.current.startPlaceId).toBe(1);
        expect(outcome).toBe(true);
    });

    it.each([
        ['add', 'post', (r) => r.add({ name: 'N' })],
        ['edit', 'patch', (r) => r.edit(1, { name: 'N' })],
        ['remove', 'delete', (r) => r.remove(1)],
        ['setStart', 'patch', (r) => r.setStart(1)],
    ])('a failed %s keeps the list, sets error and resolves false', async (_n, verb, call) => {
        const { result } = await mountReady();
        api[verb].mockRejectedValue(new Error('nope'));

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        expect(outcome).toBe(false);
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(result.current.places).toEqual([HOME, SHOP]);
        expect(result.current.startPlaceId).toBe(2);
        expect(result.current.error).toBe('nope');
        expect(result.current.status).toBe('ready');
    });

    it('keeps the list and sets error when the reload after a change fails', async () => {
        const { result } = await mountReady();
        api.post.mockResolvedValue({});
        api.get.mockRejectedValue(new Error('flaky'));

        await act(() => result.current.add({ name: 'N' }));

        expect(result.current.places).toEqual([HOME, SHOP]);
        expect(result.current.error).toBe('flaky');
    });

    it('clears error on the next successful call', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValueOnce(new Error('nope'));
        await act(() => result.current.add({ name: 'N' }));
        expect(result.current.error).toBe('nope');

        api.post.mockResolvedValue({});
        api.get.mockResolvedValue({ places: [HOME], startPlaceId: 1 });
        await act(() => result.current.add({ name: 'N' }));

        expect(result.current.error).toBeNull();
    });

    it('does not update state after unmount', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let resolve;
        api.get.mockReturnValue(new Promise((r) => { resolve = r; }));
        const { unmount } = renderHook(() => usePlaces());
        unmount();
        await act(async () => resolve({ places: [HOME], startPlaceId: 1 }));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
