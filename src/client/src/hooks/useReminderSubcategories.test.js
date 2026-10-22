import { renderHook, act, waitFor } from '@testing-library/react';

import useReminderSubcategories from './useReminderSubcategories';
import { api } from '../lib/api';

jest.mock('../lib/api');

const DESK = { id: 7, placeId: 3, name: 'Front desk' };
const DOCK = { id: 8, placeId: 3, name: 'Dock' };

const mountReady = async () => {
    api.get.mockResolvedValue({ subcategories: [DESK, DOCK] });
    const hook = renderHook(() => useReminderSubcategories(3));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useReminderSubcategories', () => {
    it('lists the place subcategories', async () => {
        const { result } = await mountReady();
        expect(api.get).toHaveBeenCalledWith('/reminder-subcategories?placeId=3');
        expect(result.current.subcategories).toEqual([DESK, DOCK]);
    });

    it('returns [] and does not fetch when placeId is null', async () => {
        const { result } = renderHook(() => useReminderSubcategories(null));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).not.toHaveBeenCalled();
        expect(result.current.subcategories).toEqual([]);
    });

    it('sets error when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useReminderSubcategories(3));
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
    });

    it('refetches when the place changes', async () => {
        api.get.mockResolvedValue({ subcategories: [DESK] });
        const { result, rerender } = renderHook((id) => useReminderSubcategories(id), { initialProps: 3 });
        await waitFor(() => expect(result.current.status).toBe('ready'));
        rerender(4);
        await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/reminder-subcategories?placeId=4'));
        await waitFor(() => expect(result.current.status).toBe('ready'));
    });

    it.each([
        ['add', 'post', '/reminder-subcategories', { placeId: 3, name: 'N' }, (r) => r.add({ name: 'N' })],
        ['rename', 'patch', '/reminder-subcategories/7', { name: 'N' }, (r) => r.rename(7, 'N')],
        ['remove', 'delete', '/reminder-subcategories/7', undefined, (r) => r.remove(7)],
    ])('%s calls the API then reloads', async (_n, verb, path, body, call) => {
        const { result } = await mountReady();
        api[verb].mockResolvedValue({});
        api.get.mockResolvedValue({ subcategories: [DOCK] });

        let outcome;
        await act(async () => {
            outcome = await call(result.current);
        });

        if (body === undefined) expect(api[verb]).toHaveBeenCalledWith(path);
        else expect(api[verb]).toHaveBeenCalledWith(path, body);
        expect(result.current.subcategories).toEqual([DOCK]);
        expect(outcome).toBe(true);
    });

    it('a failed change keeps the list, sets error and resolves false', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValue(new Error('dup'));

        let outcome;
        await act(async () => {
            outcome = await result.current.add({ name: 'N' });
        });

        expect(outcome).toBe(false);
        expect(result.current.subcategories).toEqual([DESK, DOCK]);
        expect(result.current.error).toBe('dup');
    });
});
