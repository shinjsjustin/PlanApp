import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    PX_PER_SLOT_MIN,
    SLOTS_PER_DAY,
    createDayGeometry,
} from '../lib/scheduleGeometry';

// How tall a half-hour is drawn, derived from how much room a day column
// actually got (design 2026-09-16, decision 10 and section 9.1).
//
//     pxPerSlot = max(PX_PER_SLOT_MIN, availableHeightPx / SLOTS_PER_DAY)
//
// One formula, two behaviours. On a short window the division loses, the floor
// holds, and the column fills the page at the scale the calendar has always
// drawn at — so more hours are visible than the old 70vh cap allowed and the
// rest still scrolls inside. On a window tall enough for all 24 hours the
// division wins and the day stretches to fill the column exactly.
//
// WHAT IS MEASURED, AND WHY IT IS NOT A LOOP. The scroll *viewport* — the
// element with `overflow-y: auto` — never the grid inside it. The grid's height
// is `dayHeightPx`, which is derived from the scale, so measuring the grid would
// make the scale derive from itself and oscillate. The viewport is safe because
// its height comes from flex layout: it is `flex: 1` inside a column of a fixed
// height, so what it contains cannot change how tall it is.
//
// Columns register themselves rather than the hook reaching for a selector. All
// columns are the same height, so any one would do — but a column mid-unmount
// can report 0, so the tallest is taken rather than the first.

/** The tallest viewport currently registered, ignoring any reporting 0. */
const tallestOf = (viewports) =>
    [...viewports].reduce((tallest, node) => Math.max(tallest, node.clientHeight || 0), 0);

/**
 * Drops any viewport that is no longer in the document.
 *
 * A column's ref callback is called with `null` on unmount, but React does not
 * say which node that was — a shared, stable `registerViewport` has no way to
 * tell one column's unmount from another's from that argument alone, so it
 * cannot remove the entry itself. This is what actually reclaims it: the next
 * remeasure, triggered by any other column, sees the stale node is detached and
 * drops it, so a calendar paged through a hundred days does not accumulate a
 * hundred dead entries — and a hundred open `ResizeObserver.observe`s on nodes
 * nothing will ever reattach.
 *
 * `isConnected === false`, not merely falsy, on purpose: the test stubs in
 * `useDayScale.test.js` are plain objects with no `isConnected` at all
 * (`undefined`), and only a strict `false` — which only a real, detached DOM
 * node reports — may prune.
 */
const pruneDetached = (viewports, observer) => {
    viewports.forEach((node) => {
        if (node.isConnected !== false) return;

        viewports.delete(node);
        observer?.unobserve(node);
    });
};

const scaleFor = (availableHeightPx) =>
    Math.max(PX_PER_SLOT_MIN, availableHeightPx / SLOTS_PER_DAY);

const useDayScale = () => {
    const [pxPerSlot, setPxPerSlot] = useState(PX_PER_SLOT_MIN);

    const viewportsRef = useRef(new Set());
    const observerRef = useRef(null);

    const remeasure = useCallback(() => {
        pruneDetached(viewportsRef.current, observerRef.current);

        const available = tallestOf(viewportsRef.current);

        // Nothing has been laid out yet — every column is gone, or jsdom. The
        // floor is the honest answer, and re-deriving from 0 would collapse the
        // scale on the way out of a re-render.
        if (available <= 0) {
            setPxPerSlot(PX_PER_SLOT_MIN);
            return;
        }

        setPxPerSlot(scaleFor(available));
    }, []);

    /**
     * A day column's scroll viewport, handed over as a ref callback. React
     * calls this with `null` on unmount, but never says which node that was —
     * so this cannot remove the entry itself; `pruneDetached` above is what
     * actually drops it, lazily, the next time anything remeasures.
     *
     * Safe to call on every render: a node already registered is re-added to the
     * same Set and re-observed, and `ResizeObserver.observe` on an element it is
     * already watching is a no-op.
     *
     * Deliberately does not call `remeasure` itself. `ResizeObserver.observe`
     * delivers one notification for the element's current size on its own,
     * right after the next layout — so measuring here too would just be the
     * same number a frame earlier, at the cost of a second code path. Without a
     * `ResizeObserver` there is no such notification, and the absence is exactly
     * what keeps the scale at the floor rather than measuring once and freezing
     * on whatever size happened to be registered first.
     */
    const registerViewport = useCallback((node) => {
        if (!node) return;

        viewportsRef.current.add(node);
        observerRef.current?.observe(node);
    }, []);

    useEffect(() => {
        // jsdom before 22, and any browser old enough to matter. Without a
        // ResizeObserver the scale simply stays at the floor, which is exactly
        // what the calendar did before this hook existed.
        if (typeof ResizeObserver === 'undefined') return undefined;

        const observer = new ResizeObserver(remeasure);

        observerRef.current = observer;
        viewportsRef.current.forEach((node) => observer.observe(node));

        return () => {
            observer.disconnect();
            observerRef.current = null;
        };
    }, [remeasure]);

    // Held stable across renders that did not move the scale. This object is a
    // context value, and a fresh one every render would re-render every column
    // and every card for nothing — the same reason `useCalendar` memoises its
    // own return.
    const geometry = useMemo(() => createDayGeometry(pxPerSlot), [pxPerSlot]);

    return useMemo(() => ({ geometry, registerViewport }), [geometry, registerViewport]);
};

export default useDayScale;
