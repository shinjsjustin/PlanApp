import { renderHook, act } from '@testing-library/react';
import useCurrentSlot from './useCurrentSlot';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('returns today and the current slot', () => {
    jest.setSystemTime(new Date(2026, 9, 15, 14, 47));
    const { result } = renderHook(() => useCurrentSlot());

    expect(result.current).toEqual({ today: '2026-10-15', slotMinutes: 870 });
});

it('moves to the next slot when 15:00 passes', () => {
    jest.setSystemTime(new Date(2026, 9, 15, 14, 47));
    const { result } = renderHook(() => useCurrentSlot());

    act(() => { jest.advanceTimersByTime(13 * 60 * 1000 - 1); });
    expect(result.current.slotMinutes).toBe(870);

    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.slotMinutes).toBe(900);
});

it('rolls over to the next day at midnight', () => {
    jest.setSystemTime(new Date(2026, 9, 15, 23, 45));
    const { result } = renderHook(() => useCurrentSlot());

    act(() => { jest.advanceTimersByTime(15 * 60 * 1000); });
    expect(result.current).toEqual({ today: '2026-10-16', slotMinutes: 0 });
});

it('keeps ticking one boundary at a time', () => {
    jest.setSystemTime(new Date(2026, 9, 15, 14, 47));
    const { result } = renderHook(() => useCurrentSlot());

    act(() => { jest.advanceTimersByTime(13 * 60 * 1000); });
    expect(jest.getTimerCount()).toBe(1);
    act(() => { jest.advanceTimersByTime(30 * 60 * 1000); });
    expect(result.current.slotMinutes).toBe(930);
});

it('clears the pending timer on unmount', () => {
    jest.setSystemTime(new Date(2026, 9, 15, 14, 47));
    const { unmount } = renderHook(() => useCurrentSlot());
    expect(jest.getTimerCount()).toBe(1);

    unmount();
    expect(jest.getTimerCount()).toBe(0);
});
