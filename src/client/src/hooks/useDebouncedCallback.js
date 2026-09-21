import { useCallback, useEffect, useMemo, useRef } from 'react';

// Coalesces a burst of calls into one, after things go quiet.
//
// Inline titles save on both Enter and blur, and Enter causes a blur — so the
// obvious wiring sends the same PATCH twice. Debouncing collapses that pair, and
// a run of quick edits, into a single request carrying the last value.
//
// `cancel` exists because Escape has to take a pending save back, not just
// restore the text on screen.

const useDebouncedCallback = (callback, delay, { shouldFlushOnUnmount = false } = {}) => {
    const timerRef = useRef(null);
    const argsRef = useRef([]);

    // The timer outlives the render that started it, so the callback is read
    // from a ref when it fires rather than captured in the closure. Otherwise a
    // save scheduled before a re-render would run against a stale entity.
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    const cancel = useCallback(() => {
        if (timerRef.current === null) return;

        clearTimeout(timerRef.current);
        timerRef.current = null;
        argsRef.current = [];
    }, []);

    const flush = useCallback(() => {
        if (timerRef.current === null) return;

        clearTimeout(timerRef.current);
        timerRef.current = null;
        const args = argsRef.current;
        argsRef.current = [];
        callbackRef.current(...args);
    }, []);

    // Inline fields normally drop a pending save when their row disappears.
    // Page-level fields can opt into flushing so navigation cannot discard a
    // committed edit after blur.
    useEffect(
        () => () => shouldFlushOnUnmount ? flush() : cancel(),
        [cancel, flush, shouldFlushOnUnmount]
    );

    const run = useCallback(
        (...args) => {
            cancel();
            argsRef.current = args;
            timerRef.current = setTimeout(flush, delay);
        },
        [cancel, delay, flush]
    );

    return useMemo(() => ({ run, cancel }), [run, cancel]);
};

export default useDebouncedCallback;
