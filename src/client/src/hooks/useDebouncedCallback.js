import { useCallback, useEffect, useMemo, useRef } from 'react';

// Coalesces a burst of calls into one, after things go quiet.
//
// Inline titles save on both Enter and blur, and Enter causes a blur — so the
// obvious wiring sends the same PATCH twice. Debouncing collapses that pair, and
// a run of quick edits, into a single request carrying the last value.
//
// `cancel` exists because Escape has to take a pending save back, not just
// restore the text on screen.

const useDebouncedCallback = (callback, delay) => {
    const timerRef = useRef(null);

    // The timer outlives the render that started it, so the callback is read
    // from a ref when it fires rather than captured in the closure. Otherwise a
    // save scheduled before a re-render would run against a stale entity.
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    const cancel = useCallback(() => {
        if (timerRef.current === null) return;

        clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);

    // A save that lands after the card is gone would dispatch into an unmounted
    // reducer, so the pending one is dropped on the way out.
    useEffect(() => cancel, [cancel]);

    const run = useCallback(
        (...args) => {
            cancel();

            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                callbackRef.current(...args);
            }, delay);
        },
        [cancel, delay]
    );

    return useMemo(() => ({ run, cancel }), [run, cancel]);
};

export default useDebouncedCallback;
