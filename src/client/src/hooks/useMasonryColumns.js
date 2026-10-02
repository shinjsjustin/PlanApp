import { useCallback, useLayoutEffect, useState } from 'react';

import { columnsFor } from '../lib/masonry';

// How many columns fit (and the grid's pixel width), measured from the grid element's own
// width. The grid is attached through a callback ref so measuring starts as
// soon as the element exists, and restarts if React swaps the element. Measuring
// runs in a layout effect so the first painted frame already has the real width.
const useMasonryColumns = ({ cardMinPx = 260, gapPx = 16 } = {}) => {
    const [element, setElement] = useState(null);
    const [columns, setColumns] = useState(1);
    const [width, setWidth] = useState(0);

    const measureRef = useCallback((node) => setElement(node), []);

    useLayoutEffect(() => {
        if (!element) return undefined;

        // Column count and pixel width of the grid right now.
        const measure = () => {
            setColumns(columnsFor(element.clientWidth, cardMinPx, gapPx));
            setWidth(element.clientWidth);
        };
        measure();

        // jsdom has no ResizeObserver; the window event is the fallback.
        if (typeof window.ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }

        const observer = new window.ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [element, cardMinPx, gapPx]);

    return [measureRef, columns, width];
};

export default useMasonryColumns;
