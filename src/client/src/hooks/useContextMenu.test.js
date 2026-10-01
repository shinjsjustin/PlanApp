import { act, renderHook } from '@testing-library/react';

import useContextMenu, { LONG_PRESS_MS } from './useContextMenu';

const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }], preventDefault: jest.fn() });

describe('useContextMenu', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('opens at the pointer position and prevents the native menu', () => {
        const { result } = renderHook(() => useContextMenu());
        const event = { clientX: 30, clientY: 40, preventDefault: jest.fn() };

        act(() => result.current.triggerProps.onContextMenu(event));

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(result.current.menu).toEqual({ x: 30, y: 40 });
    });

    test('opens at the target rect when the keyboard fires with 0,0 coordinates', () => {
        const { result } = renderHook(() => useContextMenu());
        const event = {
            clientX: 0,
            clientY: 0,
            currentTarget: { getBoundingClientRect: () => ({ left: 12, bottom: 80 }) },
            target: { getBoundingClientRect: () => ({ left: 12, bottom: 80 }) },
            preventDefault: jest.fn(),
        };

        act(() => result.current.triggerProps.onContextMenu(event));

        expect(result.current.menu).toEqual({ x: 12, y: 80 });
    });

    test('close clears the menu', () => {
        const { result } = renderHook(() => useContextMenu());
        act(() => result.current.triggerProps.onContextMenu({ clientX: 1, clientY: 2, preventDefault() {} }));

        act(() => result.current.close());

        expect(result.current.menu).toBeNull();
    });

    test('a touch held for the long-press delay opens at the touch point', () => {
        const { result } = renderHook(() => useContextMenu());

        act(() => result.current.triggerProps.onTouchStart(touch(5, 6)));
        act(() => jest.advanceTimersByTime(LONG_PRESS_MS - 1));
        expect(result.current.menu).toBeNull();
        act(() => jest.advanceTimersByTime(1));

        expect(LONG_PRESS_MS).toBe(500);
        expect(result.current.menu).toEqual({ x: 5, y: 6 });
    });

    test.each(['onTouchEnd', 'onTouchMove', 'onTouchCancel'])(
        '%s before the delay cancels the long press',
        (handler) => {
            const { result } = renderHook(() => useContextMenu());

            act(() => result.current.triggerProps.onTouchStart(touch(5, 6)));
            act(() => jest.advanceTimersByTime(LONG_PRESS_MS - 1));
            act(() => result.current.triggerProps[handler](touch(5, 6)));
            act(() => jest.advanceTimersByTime(LONG_PRESS_MS));

            expect(result.current.menu).toBeNull();
        }
    );

    test('touchend after a long press suppresses the click; a short tap does not', () => {
        const { result } = renderHook(() => useContextMenu());

        act(() => result.current.triggerProps.onTouchStart(touch(5, 6)));
        const tap = touch(5, 6);
        act(() => result.current.triggerProps.onTouchEnd(tap));
        expect(tap.preventDefault).not.toHaveBeenCalled();

        act(() => result.current.triggerProps.onTouchStart(touch(5, 6)));
        act(() => jest.advanceTimersByTime(LONG_PRESS_MS));
        const release = touch(5, 6);
        act(() => result.current.triggerProps.onTouchEnd(release));
        expect(release.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('clears the pending timer on unmount', () => {
        const { result, unmount } = renderHook(() => useContextMenu());
        act(() => result.current.triggerProps.onTouchStart(touch(5, 6)));

        unmount();

        expect(jest.getTimerCount()).toBe(0);
    });
});
