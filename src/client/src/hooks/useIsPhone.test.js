import { renderHook, act } from '@testing-library/react';
import useIsPhone, { PHONE_QUERY } from './useIsPhone';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
    window.matchMedia = originalMatchMedia;
});

const stubMatchMedia = (matches) => {
    const mql = {
        matches,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    };
    window.matchMedia = jest.fn(() => mql);
    return mql;
};

const fire = (mql, matches) => {
    mql.matches = matches;
    const handler = mql.addEventListener.mock.calls[0][1];
    act(() => handler({ matches }));
};

test('exports the 600px phone query', () => {
    expect(PHONE_QUERY).toBe('(max-width: 600px)');
});

test('returns false when matchMedia is undefined', () => {
    window.matchMedia = undefined;
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(false);
});

test('returns the matches value of the stubbed query', () => {
    const mql = stubMatchMedia(true);
    const { result } = renderHook(() => useIsPhone());
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 600px)');
    expect(result.current).toBe(true);
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
});

test('re-renders when the change listener fires', () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(false);
    fire(mql, true);
    expect(result.current).toBe(true);
    fire(mql, false);
    expect(result.current).toBe(false);
});

test('removes the same listener on unmount', () => {
    const mql = stubMatchMedia(false);
    const { unmount } = renderHook(() => useIsPhone());
    const handler = mql.addEventListener.mock.calls[0][1];
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', handler);
});
