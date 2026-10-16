import { renderHook, waitFor } from '@testing-library/react';

import { api } from '../lib/api';
import useDriveTimes, { clearDriveTimeCache } from './useDriveTimes';

jest.mock('../lib/api', () => ({
    api: { get: jest.fn() },
}));

const LEG_A = { key: 'a', fromPlaceId: 1, toPlaceId: 2, departAt: '2026-10-16T09:00:00-07:00' };
const LEG_B = { key: 'b', fromPlaceId: 2, toPlaceId: 3, departAt: '2026-10-16T11:00:00-07:00' };
const ANSWER = { status: 'ok', durationSeconds: 600, distanceMeters: 5000, mapsUrl: 'https://maps/x' };

beforeEach(() => {
    jest.clearAllMocks();
    clearDriveTimeCache();
});

describe('useDriveTimes', () => {
    test('requests each leg and maps its key to the answer', async () => {
        api.get.mockResolvedValue(ANSWER);

        const { result } = renderHook(() => useDriveTimes([LEG_A]));

        expect(result.current).toEqual({});
        await waitFor(() => expect(result.current.a).toEqual(ANSWER));
        expect(api.get).toHaveBeenCalledWith(
            '/bourne/travel?from=1&to=2&departAt=2026-10-16T09%3A00%3A00-07%3A00',
        );
    });

    test('requests a repeated leg once', async () => {
        api.get.mockResolvedValue(ANSWER);
        const twin = { ...LEG_A, key: 'a2' };

        const { result } = renderHook(() => useDriveTimes([LEG_A, twin]));

        await waitFor(() => expect(result.current.a2).toEqual(ANSWER));
        expect(result.current.a).toEqual(ANSWER);
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('maps a failed leg to unavailable and logs, leaving others intact', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        api.get.mockImplementation((url) =>
            url.includes('from=1') ? Promise.reject(new Error('down')) : Promise.resolve(ANSWER),
        );

        const { result } = renderHook(() => useDriveTimes([LEG_A, LEG_B]));

        await waitFor(() => expect(result.current.b).toEqual(ANSWER));
        expect(result.current.a).toEqual({ status: 'unavailable', mapsUrl: null });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('remounting with the same legs makes no new request', async () => {
        api.get.mockResolvedValue(ANSWER);
        const first = renderHook(() => useDriveTimes([LEG_A]));
        await waitFor(() => expect(first.result.current.a).toEqual(ANSWER));
        first.unmount();

        const second = renderHook(() => useDriveTimes([LEG_A]));

        await waitFor(() => expect(second.result.current.a).toEqual(ANSWER));
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('does not re-request when rerendered with equal legs in a new array', async () => {
        api.get.mockResolvedValue(ANSWER);
        const { result, rerender } = renderHook(({ legs }) => useDriveTimes(legs), {
            initialProps: { legs: [LEG_A] },
        });
        await waitFor(() => expect(result.current.a).toEqual(ANSWER));

        rerender({ legs: [{ ...LEG_A }] });

        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('ignores an answer that lands after unmount', async () => {
        let resolve;
        api.get.mockReturnValue(new Promise((r) => { resolve = r; }));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result, unmount } = renderHook(() => useDriveTimes([LEG_A]));
        unmount();
        resolve(ANSWER);
        await Promise.resolve();

        expect(result.current).toEqual({});
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
