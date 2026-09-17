import { act, renderHook } from '@testing-library/react';

import useDayScale from './useDayScale';
import { PX_PER_SLOT_MIN, SLOTS_PER_DAY } from '../lib/scheduleGeometry';

/**
 * The scale is derived from how tall a day column's scroll viewport turns out to
 * be. jsdom has no layout, so the viewport is a stub whose `clientHeight` the
 * test sets, and the ResizeObserver is a stub the test fires by hand.
 */

let observers = [];

class StubResizeObserver {
    constructor(callback) {
        this.callback = callback;
        this.elements = new Set();
        observers.push(this);
    }

    observe(element) {
        this.elements.add(element);
    }

    unobserve(element) {
        this.elements.delete(element);
    }

    disconnect() {
        this.elements.clear();
    }

    /** What the browser would call after a layout change. */
    fire() {
        this.callback([...this.elements].map((element) => ({ target: element })));
    }
}

const viewportOf = (clientHeight) => ({ clientHeight });

const fireAll = () =>
    act(() => {
        observers.forEach((observer) => observer.fire());
    });

beforeEach(() => {
    observers = [];
    global.ResizeObserver = StubResizeObserver;
});

describe('useDayScale', () => {
    test('starts at the floor before anything has been measured', () => {
        // Act
        const { result } = renderHook(() => useDayScale());

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    test('stays at the floor when the viewport is too short for a whole day', () => {
        // Arrange — half a day's worth of room
        const { result } = renderHook(() => useDayScale());
        const short = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 0.5;

        // Act
        act(() => result.current.registerViewport(viewportOf(short)));
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    test('stretches so a whole day exactly fills a tall viewport', () => {
        // Arrange — twice the room a day needs at the floor
        const { result } = renderHook(() => useDayScale());
        const tall = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2;

        // Act
        act(() => result.current.registerViewport(viewportOf(tall)));
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN * 2);
        expect(result.current.geometry.dayHeightPx).toBe(tall);
    });

    test('follows the viewport when it is resized', () => {
        // Arrange
        const { result } = renderHook(() => useDayScale());
        const viewport = viewportOf(PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2);

        act(() => result.current.registerViewport(viewport));
        fireAll();

        // Act — the window shrinks below a whole day
        viewport.clientHeight = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 0.5;
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    test('takes the tallest of several columns', () => {
        // Arrange — every column is the same height in practice, but a column
        // mid-unmount can report 0, and that must not shrink the whole strip.
        const { result } = renderHook(() => useDayScale());
        const tall = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2;

        // Act
        act(() => {
            result.current.registerViewport(viewportOf(0));
            result.current.registerViewport(viewportOf(tall));
        });
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN * 2);
    });

    test('keeps the same geometry object while the scale has not moved', () => {
        // Arrange — the object is a context value; a new one every render would
        // re-render every column for nothing.
        const { result, rerender } = renderHook(() => useDayScale());
        const before = result.current.geometry;

        // Act
        rerender();

        // Assert
        expect(result.current.geometry).toBe(before);
    });

    test('survives a browser with no ResizeObserver', () => {
        // Arrange
        delete global.ResizeObserver;

        // Act
        const { result } = renderHook(() => useDayScale());
        act(() => result.current.registerViewport(viewportOf(2000)));

        // Assert — the floor, and no throw
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    // Added beyond the 7 tests in the spec this file started from. React calls a
    // ref callback with `null` on unmount but never says which node it was, so a
    // shared `registerViewport` cannot drop the entry itself — see the
    // `pruneDetached` note in useDayScale.js. A real, detached DOM node reports
    // `isConnected === false`; nothing here can prove that with the plain-object
    // stub `viewportOf` returns, so this test uses a stub that mimics it.
    test('drops a detached viewport once another remeasure runs', () => {
        // Arrange — a tall column, then a second column that goes away.
        const { result } = renderHook(() => useDayScale());
        const tall = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2;
        const staleViewport = { clientHeight: tall, isConnected: true };

        act(() => result.current.registerViewport(staleViewport));
        fireAll();
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN * 2);

        // Act — the column unmounts (`isConnected` flips, as it does for a real
        // DOM node) and a second, shorter column registers in its place.
        staleViewport.isConnected = false;
        const freshViewport = { clientHeight: PX_PER_SLOT_MIN * SLOTS_PER_DAY, isConnected: true };
        act(() => result.current.registerViewport(freshViewport));
        fireAll();

        // Assert — the stale entry was dropped rather than still counted as the
        // tallest, so the scale now tracks only the live column.
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });
});
