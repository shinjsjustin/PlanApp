import { renderHook, waitFor, act } from '@testing-library/react';

import useDateEvents from './useDateEvents';
import { api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');
    return { ...actual, api: { get: jest.fn() } };
});

const allDay = (id) => ({ id, summary: id, start: '2026-03-05', end: '2026-03-06', allDay: true });

const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });
    return { promise, ...settle };
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('fetches the date and returns its blocks', async () => {
    api.get.mockResolvedValue({ events: [allDay('a')] });
    const { result } = renderHook(() => useDateEvents('2026-03-05', true));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(api.get).toHaveBeenCalledWith('/bourne/calendar/events?from=2026-03-05&to=2026-03-05');
    expect(result.current.events[0]).toMatchObject({ id: 'a', allDay: true, startMinutes: 0, durationMinutes: 1440 });
    expect(result.current.isUnavailable).toBe(false);
});

test('fetches nothing and returns [] when shouldFetch is false', () => {
    const { result } = renderHook(() => useDateEvents('2026-03-05', false));
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current).toEqual({ events: [], isUnavailable: false });
});

test('returns [] and isUnavailable when the GET rejects', async () => {
    api.get.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useDateEvents('2026-03-05', true));
    await waitFor(() => expect(result.current.isUnavailable).toBe(true));
    expect(result.current.events).toEqual([]);
});

test('treats a body without an events array as no events', async () => {
    api.get.mockResolvedValue([]);
    const { result } = renderHook(() => useDateEvents('2026-03-05', true));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toEqual({ events: [], isUnavailable: false });
});

test('ignores a stale response after the date changes', async () => {
    const first = deferred();
    api.get.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ events: [] });
    const { result, rerender } = renderHook(({ key }) => useDateEvents(key, true), {
        initialProps: { key: '2026-03-05' },
    });
    rerender({ key: '2026-03-06' });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve({ events: [allDay('late')] }));
    expect(result.current.events).toEqual([]);
});

test('clears the previous date events when the date changes', async () => {
    const second = deferred();
    api.get.mockResolvedValueOnce({ events: [allDay('a')] }).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ key }) => useDateEvents(key, true), {
        initialProps: { key: '2026-03-05' },
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    rerender({ key: '2026-03-06' });
    expect(result.current.events).toEqual([]);
});
