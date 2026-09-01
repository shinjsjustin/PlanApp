import { act, renderHook } from '@testing-library/react';

import useDebouncedCallback from './useDebouncedCallback';

const DELAY = 300;

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

const advance = (ms) => act(() => jest.advanceTimersByTime(ms));

describe('useDebouncedCallback', () => {
    test('does not call through until the delay has passed', () => {
        // Arrange
        const save = jest.fn();
        const { result } = renderHook(() => useDebouncedCallback(save, DELAY));

        // Act
        act(() => result.current.run('Learning'));
        advance(DELAY - 1);

        // Assert
        expect(save).not.toHaveBeenCalled();

        // Act
        advance(1);

        // Assert
        expect(save).toHaveBeenCalledWith('Learning');
    });

    test('collapses a burst of calls into one, with the last arguments', () => {
        // Arrange — an inline title saves on Enter and again on the blur that
        // Enter causes, which must not be two requests.
        const save = jest.fn();
        const { result } = renderHook(() => useDebouncedCallback(save, DELAY));

        // Act
        act(() => result.current.run('Learn'));
        advance(DELAY - 50);
        act(() => result.current.run('Learning'));
        advance(DELAY);

        // Assert
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith('Learning');
    });

    test('cancel drops a call that has not fired yet', () => {
        // Arrange
        const save = jest.fn();
        const { result } = renderHook(() => useDebouncedCallback(save, DELAY));

        // Act — this is what Escape does: revert, and take the pending save back.
        act(() => result.current.run('Typo'));
        act(() => result.current.cancel());
        advance(DELAY * 2);

        // Assert
        expect(save).not.toHaveBeenCalled();
    });

    test('cancel on an idle debouncer is harmless', () => {
        // Arrange
        const save = jest.fn();
        const { result } = renderHook(() => useDebouncedCallback(save, DELAY));

        // Act + Assert
        expect(() => act(() => result.current.cancel())).not.toThrow();
    });

    test('never fires after the component has unmounted', () => {
        // Arrange
        const save = jest.fn();
        const { result, unmount } = renderHook(() => useDebouncedCallback(save, DELAY));
        act(() => result.current.run('Learning'));

        // Act
        unmount();
        advance(DELAY * 2);

        // Assert
        expect(save).not.toHaveBeenCalled();
    });

    test('calls the latest callback, not the one captured when the timer started', () => {
        // Arrange
        const first = jest.fn();
        const second = jest.fn();
        const { result, rerender } = renderHook(({ fn }) => useDebouncedCallback(fn, DELAY), {
            initialProps: { fn: first },
        });

        // Act
        act(() => result.current.run('Learning'));
        rerender({ fn: second });
        advance(DELAY);

        // Assert
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith('Learning');
    });
});
