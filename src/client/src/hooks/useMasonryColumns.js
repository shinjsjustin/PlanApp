import { useCallback, useEffect, useState } from 'react';

import { columnsFor } from '../lib/masonry';

// How many cards fit (and the grid's pixel width), per masonry row, measured from the grid element's own
// width. The grid is attached through a callback ref so measuring starts as
// soon as the element exists, and restarts if React swaps the element.
const useMasonryColumns = ({ cardMinPx = 260, gapPx = 16 } = {}) => {
    const [element, setElement] = useState(null);
    const [columns, setColumns] = useState(1);
    const [width, setWidth] = useState(0);

    const measureRef = useCallback((node) => setElement(node), []);

    useEffect(() => {
        if (!element) return undefined;

        // Bail out on an unchanged count so a resize drag does not re-render.
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
