import { useEffect } from 'react';
import { act, renderHook } from '@testing-library/react';

import useCardHeights from './useCardHeights';

const makeCard = (heightPx) => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: heightPx });
    return el;
};
const setHeight = (el, value) =>
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value });

let instances;
beforeEach(() => {
    instances = [];
    window.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.observe = jest.fn();
            this.unobserve = jest.fn();
            this.disconnect = jest.fn();
            instances.push(this);
        }
    };
});
afterEach(() => {
    delete window.ResizeObserver;
});

describe('useCardHeights', () => {
    it('starts empty and returns the same refFor across renders', () => {
        const { result, rerender } = renderHook(() => useCardHeights());
        const first = result.current[0];

        expect(result.current[1]).toEqual({});
        rerender();
        expect(result.current[0]).toBe(first);
    });

    it('returns the same callback ref for the same id and different ones per id', () => {
        const { result } = renderHook(() => useCardHeights());
        const [refFor] = result.current;

        expect(refFor(1)).toBe(refFor(1));
        expect(refFor(1)).not.toBe(refFor(2));
    });

    it('reads offsetHeight on attach and observes the node', () => {
        const { result } = renderHook(() => useCardHeights());
        const a = makeCard(120);
        const b = makeCard(200);

        act(() => {
            result.current[0](1)(a);
            result.current[0](2)(b);
        });

        expect(result.current[1]).toEqual({ 1: 120, 2: 200 });
        expect(instances).toHaveLength(1);
        expect(instances[0].observe).toHaveBeenCalledWith(a);
        expect(instances[0].observe).toHaveBeenCalledWith(b);
    });

    it('re-renders with a changed height but not with an unchanged one', () => {
        let renders = 0;
        const { result } = renderHook(() => {
            const value = useCardHeights();
            useEffect(() => {
                renders += 1;
            });
            return value;
        });
        const a = makeCard(120);
        act(() => result.current[0](1)(a));
        const before = renders;
        const heights = result.current[1];

        act(() => instances[0].callback([{ target: a }]));
        expect(renders).toBe(before);
        expect(result.current[1]).toBe(heights);

        setHeight(a, 150);
        act(() => instances[0].callback([{ target: a }]));
        expect(result.current[1]).toEqual({ 1: 150 });
    });

    it('drops a detached id and unobserves its node', () => {
        const { result } = renderHook(() => useCardHeights());
        const a = makeCard(120);
        const b = makeCard(80);
        act(() => {
            result.current[0](1)(a);
            result.current[0](2)(b);
        });

        act(() => result.current[0](1)(null));

        expect(result.current[1]).toEqual({ 2: 80 });
        expect(instances[0].unobserve).toHaveBeenCalledWith(a);
    });

    it('ignores observer entries for detached nodes', () => {
        const { result } = renderHook(() => useCardHeights());
        const a = makeCard(120);
        act(() => result.current[0](1)(a));
        act(() => result.current[0](1)(null));

        act(() => instances[0].callback([{ target: a }]));

        expect(result.current[1]).toEqual({});
    });

    it('disconnects the observer on unmount', () => {
        const { result, unmount } = renderHook(() => useCardHeights());
        act(() => result.current[0](1)(makeCard(120)));

        unmount();

        expect(instances[0].disconnect).toHaveBeenCalled();
    });

    it('still measures once when ResizeObserver is missing', () => {
        delete window.ResizeObserver;
        const { result } = renderHook(() => useCardHeights());

        act(() => result.current[0](1)(makeCard(90)));

        expect(result.current[1]).toEqual({ 1: 90 });
    });
});
