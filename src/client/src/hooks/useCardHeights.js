import { useCallback, useEffect, useRef, useState } from 'react';

// Measured offsetHeight per card id. Callback refs are cached per id so React
// does not detach and reattach them on every render.
const useCardHeights = () => {
    const [heights, setHeights] = useState({});
    const observerRef = useRef(null);
    const nodesRef = useRef(new Map());
    const refsRef = useRef(new Map());

    const setHeight = useCallback((id, height) => {
        // Return the same object when unchanged so React skips the re-render.
        setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }));
    }, []);

    const getObserver = useCallback(() => {
        if (observerRef.current || typeof window.ResizeObserver === 'undefined') {
            return observerRef.current;
        }
        observerRef.current = new window.ResizeObserver((entries) => {
            entries.forEach(({ target }) => {
                const id = [...nodesRef.current].find(([, node]) => node === target)?.[0];
                if (id !== undefined) setHeight(id, target.offsetHeight);
            });
        });
        return observerRef.current;
    }, [setHeight]);

    const refFor = useCallback((id) => {
        if (!refsRef.current.has(id)) {
            refsRef.current.set(id, (node) => {
                const previous = nodesRef.current.get(id);
                if (previous) getObserver()?.unobserve(previous);
                if (!node) {
                    nodesRef.current.delete(id);
                    setHeights((prev) => {
                        if (!(id in prev)) return prev;
                        const { [id]: removed, ...rest } = prev;
                        return rest;
                    });
                    return;
                }
                nodesRef.current.set(id, node);
                setHeight(id, node.offsetHeight);
                getObserver()?.observe(node);
            });
        }
        return refsRef.current.get(id);
    }, [getObserver, setHeight]);

    useEffect(() => () => {
        observerRef.current?.disconnect();
        observerRef.current = null;
    }, []);

    return [refFor, heights];
};

export default useCardHeights;
