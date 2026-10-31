import { act, renderHook, waitFor } from '@testing-library/react';

import useLivedMoments from './useLivedMoments';
import { api, ApiError } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return { ...actual, api: { get: jest.fn() } };
});

const moment = (id) => ({ id, date: '2026-10-31', startMinutes: 480, durationMinutes: 60 });

const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

const range = (from, to) => ({ from, to });

beforeEach(() => {
    jest.clearAllMocks();
});

test('GETs the range on mount, starting in loading, then exposes the moments', async () => {
    api.get.mockResolvedValue({ moments: [moment(1)] });

    const { result } = renderHook(() => useLivedMoments(range('2026-10-25', '2026-10-31')));

    expect(result.current.status).toBe('loading');
    expect(result.current.moments).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.get).toHaveBeenCalledWith('/lived?from=2026-10-25&to=2026-10-31');
    expect(result.current.moments).toEqual([moment(1)]);
    expect(result.current.error).toBeNull();
});

test('refetches when the range changes and does not refetch on a same-valued rerender', async () => {
    api.get.mockResolvedValue({ moments: [] });

    const { result, rerender } = renderHook((r) => useLivedMoments(r), {
        initialProps: range('2026-10-25', '2026-10-31'),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender(range('2026-10-25', '2026-10-31'));
    expect(api.get).toHaveBeenCalledTimes(1);

    api.get.mockResolvedValue({ moments: [moment(2)] });
    rerender(range('2026-11-01', '2026-11-07'));

    await waitFor(() => expect(result.current.moments).toEqual([moment(2)]));
    expect(api.get).toHaveBeenLastCalledWith('/lived?from=2026-11-01&to=2026-11-07');
});

test('a stale response for an old range never overwrites the newer one', async () => {
    const old = deferred();
    const fresh = deferred();
    api.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);

    const { result, rerender } = renderHook((r) => useLivedMoments(r), {
        initialProps: range('2026-10-25', '2026-10-31'),
    });
    rerender(range('2026-11-01', '2026-11-07'));

    await act(async () => {
        fresh.resolve({ moments: [moment(2)] });
    });
    await act(async () => {
        old.resolve({ moments: [moment(1)] });
    });

    expect(result.current.moments).toEqual([moment(2)]);
    expect(result.current.status).toBe('ready');
});

test('a stale failure for an old range does not set error', async () => {
    const old = deferred();
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ moments: [] });

    const { result, rerender } = renderHook((r) => useLivedMoments(r), {
        initialProps: range('2026-10-25', '2026-10-31'),
    });
    rerender(range('2026-11-01', '2026-11-07'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
        old.reject(new ApiError('late failure', 500));
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
});

test('a failed request sets error status with the message, and reload retries', async () => {
    api.get.mockRejectedValueOnce(new ApiError('Could not reach the server.', 0));

    const { result } = renderHook(() => useLivedMoments(range('2026-10-25', '2026-10-31')));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not reach the server.');

    api.get.mockResolvedValueOnce({ moments: [moment(3)] });
    act(() => result.current.reload());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.moments).toEqual([moment(3)]);
});

test('an unexpected payload counts as no moments', async () => {
    api.get.mockResolvedValue([]);

    const { result } = renderHook(() => useLivedMoments(range('2026-10-25', '2026-10-31')));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.moments).toEqual([]);
});

test('returns a stable object and reload across rerenders', async () => {
    api.get.mockResolvedValue({ moments: [moment(1)] });

    const { result, rerender } = renderHook(() => useLivedMoments(range('2026-10-25', '2026-10-31')));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
});
