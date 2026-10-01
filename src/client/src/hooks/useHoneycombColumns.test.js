import { act, renderHook } from '@testing-library/react';

import { columnsFor } from '../lib/honeycomb';
import useHoneycombColumns from './useHoneycombColumns';

const makeGrid = (widthPx) => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: widthPx });
    return el;
};

afterEach(() => {
    delete window.ResizeObserver;
    jest.restoreAllMocks();
});

describe('useHoneycombColumns', () => {
    it('returns a ref callback and 1 column before anything is measured', () => {
        const { result } = renderHook(() => useHoneycombColumns());

        expect(typeof result.current[0]).toBe('function');
        expect(result.current[1]).toBe(1);
    });

    it('measures the attached element and re-measures on window resize without ResizeObserver', () => {
        const grid = makeGrid(1100);
        const { result } = renderHook(() => useHoneycombColumns());

        act(() => result.current[0](grid));
        act(() => {
            window.dispatchEvent(new Event('resize'));
        });
        expect(result.current[1]).toBe(columnsFor(1100, 260, 16));
        expect(result.current[1]).toBe(4);

        Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 500 });
        act(() => {
            window.dispatchEvent(new Event('resize'));
        });
        expect(result.current[1]).toBe(1);
    });

    it('honors custom cardMinPx and gapPx', () => {
        const { result } = renderHook(() => useHoneycombColumns({ cardMinPx: 100, gapPx: 0 }));

        act(() => result.current[0](makeGrid(350)));
        expect(result.current[1]).toBe(3);
    });

    it('removes the resize listener on unmount', () => {
        const remove = jest.spyOn(window, 'removeEventListener');
        const { result, unmount } = renderHook(() => useHoneycombColumns());
        act(() => result.current[0](makeGrid(1100)));

        unmount();

        expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('uses ResizeObserver when defined and disconnects it on unmount', () => {
        const instances = [];
        window.ResizeObserver = class {
            constructor(callback) {
                this.callback = callback;
                this.observe = jest.fn();
                this.disconnect = jest.fn();
                instances.push(this);
            }
        };
        const add = jest.spyOn(window, 'addEventListener');
        const grid = makeGrid(1100);
        const { result, unmount } = renderHook(() => useHoneycombColumns());

        act(() => result.current[0](grid));
        expect(instances).toHaveLength(1);
        expect(instances[0].observe).toHaveBeenCalledWith(grid);
        expect(add).not.toHaveBeenCalledWith('resize', expect.any(Function));

        Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 560 });
        act(() => instances[0].callback());
        expect(result.current[1]).toBe(columnsFor(560, 260, 16));

        unmount();
        expect(instances[0].disconnect).toHaveBeenCalled();
    });
});
