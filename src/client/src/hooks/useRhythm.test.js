import { act, renderHook, waitFor } from '@testing-library/react';

import useRhythm from './useRhythm';
import { api, ApiError } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return { ...actual, api: { get: jest.fn(), patch: jest.fn() } };
});

const anchor = (overrides = {}) => ({
    id: 'wake',
    title: 'Wake',
    description: null,
    time: '06:30',
    days: 'daily',
    enabled: true,
    updatedAt: '2026-11-01T12:00:00.000Z',
    updatedBy: 'bourne',
    ...overrides,
});
const gate = { id: 'g1', title: 'Plan the week', kind: 'plan', state: 'open' };
const payload = (overrides = {}) => ({
    timeZone: 'America/Chicago',
    anchors: [anchor(), anchor({ id: 'walk', title: 'Walk' })],
    gates: [gate],
    ...overrides,
});

const FULL_BODY = { time: '07:30', days: ['mon', 'wed'], enabled: false };
const DAILY_BODY = { days: 'daily' };

const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

beforeEach(() => {
    jest.clearAllMocks();
});

test('GETs /rhythm on mount, starting in loading, then exposes zone, anchors and gates', async () => {
    api.get.mockResolvedValue(payload());

    const { result } = renderHook(() => useRhythm());

    expect(result.current.status).toBe('loading');
    expect(result.current.anchors).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.get).toHaveBeenCalledWith('/rhythm');
    expect(result.current.timeZone).toBe('America/Chicago');
    expect(result.current.anchors).toEqual(payload().anchors);
    expect(result.current.gates).toEqual([gate]);
    expect(result.current.error).toBeNull();
});

test('keeps a null time zone and tolerates a malformed payload as empty', async () => {
    api.get.mockResolvedValue({ timeZone: null });

    const { result } = renderHook(() => useRhythm());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.timeZone).toBeNull();
    expect(result.current.anchors).toEqual([]);
    expect(result.current.gates).toEqual([]);
});

test('a failed load sets error with the message, and reload refetches', async () => {
    api.get.mockRejectedValueOnce(new ApiError('Could not reach the server.', 0));

    const { result } = renderHook(() => useRhythm());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not reach the server.');

    api.get.mockResolvedValueOnce(payload());
    act(() => result.current.reload());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.anchors).toHaveLength(2);
});

test('only the latest request writes state', async () => {
    const old = deferred();
    const fresh = deferred();
    api.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);

    const { result } = renderHook(() => useRhythm());
    act(() => result.current.reload());

    await act(async () => {
        fresh.resolve(payload({ timeZone: 'Asia/Tokyo' }));
    });
    await act(async () => {
        old.resolve(payload({ timeZone: 'Europe/Paris' }));
    });

    expect(result.current.timeZone).toBe('Asia/Tokyo');
});

test.each([
    ['all three fields', FULL_BODY],
    ['days daily', DAILY_BODY],
])('saveAnchor patches with exactly the body (%s) and replaces only that anchor', async (_label, body) => {
    api.get.mockResolvedValue(payload());
    const { result } = renderHook(() => useRhythm());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const saved = anchor({ ...body, updatedBy: 'justin' });
    api.patch.mockResolvedValue({ anchor: saved });
    await act(async () => {
        await result.current.saveAnchor('wake', body);
    });

    expect(api.patch).toHaveBeenCalledWith('/rhythm/anchors/wake', body);
    expect(result.current.anchors).toEqual([saved, anchor({ id: 'walk', title: 'Walk' })]);
    expect(result.current.gates).toEqual([gate]);
    expect(result.current.timeZone).toBe('America/Chicago');
});

test('saveAnchor encodes the id in the path', async () => {
    api.get.mockResolvedValue(payload());
    const { result } = renderHook(() => useRhythm());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    api.patch.mockResolvedValue({ anchor: anchor() });
    await act(async () => {
        await result.current.saveAnchor('a b/c', DAILY_BODY);
    });

    expect(api.patch).toHaveBeenCalledWith('/rhythm/anchors/a%20b%2Fc', DAILY_BODY);
});

test('a failed saveAnchor rejects with the API message and leaves state unchanged', async () => {
    api.get.mockResolvedValue(payload());
    const { result } = renderHook(() => useRhythm());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const before = result.current;

    api.patch.mockRejectedValue(new ApiError('Time must be HH:MM.', 400));
    let caught;
    await act(async () => {
        caught = await result.current.saveAnchor('wake', { time: '7:30' }).catch((err) => err);
    });

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.message).toBe('Time must be HH:MM.');
    expect(result.current).toBe(before);
});
