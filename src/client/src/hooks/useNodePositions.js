import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Where everything on the canvas actually is (spec section 4.6).
//
// The cards are laid out by flexbox, so nothing in the app knows their
// coordinates — only the browser does. This is the one place that asks it. Cards
// and connector dots register their nodes as they mount; after layout, every
// node is read in one pass and turned into coordinates relative to the canvas.
//
// The `ResizeObserver` is what makes that stay true without anything else
// helping. Expanding a card grows its row and so the canvas; resizing the window
// changes its width and reflows every row. Each of those resizes the canvas, the
// observer fires, and the edges are re-measured — so none of those features has
// to know edges exist, and there is no recalculate-the-edges call to remember to
// add to the next one.
//
// Measuring belongs here and path math belongs in `lib/geometry`. That split is
// why the maths is unit-tested and this is left to the Playwright flow: jsdom
// reports every rectangle as zero, so there is nothing here worth asserting
// without a real browser.

/** The middle of an element, relative to the canvas content box. */
const centreOf = (rect, origin) => ({
    x: rect.left + rect.width / 2 - origin.x,
    y: rect.top + rect.height / 2 - origin.y,
});

/** The middle of an element's top edge — where an incoming edge lands. */
const topEdgeOf = (rect, origin) => ({
    x: rect.left + rect.width / 2 - origin.x,
    y: rect.top - origin.y,
});

const EMPTY = { nodes: {}, size: { width: 0, height: 0 } };

/**
 * `canvasRef` is the container everything is measured against.
 * `revision` is anything that should force a re-measure on its own — the set of
 * sequences on the canvas, say. A resize is caught by the observer; a card
 * appearing without changing the canvas's size is not, and this covers it.
 */
const useNodePositions = (canvasRef, revision) => {
    // The DOM nodes themselves live in a ref, not in state: registering one must
    // not re-render, and their identities are not what the canvas draws from.
    const nodesRef = useRef(new Map());
    const [measurements, setMeasurements] = useState(EMPTY);

    const register = useCallback(
        (part) => (sequenceId, node) => {
            const nodes = nodesRef.current;
            const entry = { ...nodes.get(sequenceId), [part]: node };

            // React passes null on unmount. A sequence with neither part left is
            // gone from the canvas and should not linger in the map.
            if (entry.dot || entry.card) {
                nodes.set(sequenceId, entry);
                return;
            }

            nodes.delete(sequenceId);
        },
        []
    );

    const registerDot = useMemo(() => register('dot'), [register]);
    const registerCard = useMemo(() => register('card'), [register]);

    /**
     * Reads every registered node in one pass.
     *
     * The origin subtracts the canvas's own viewport position and adds back how
     * far it has been scrolled, so the coordinates are positions in the canvas's
     * content — which is what the SVG overlay is sized to. The canvas is not a
     * scroll container any more and both offsets are zero, but they are kept
     * because the measurement is only correct with them if it ever becomes one
     * again, and reading them costs nothing.
     *
     * A sequence missing either part is skipped. Both are needed to draw a line
     * between two cards, and a half-mounted one is a moment, not a fault;
     * `edgePaths` leaves out any edge whose ends are not here yet.
     */
    const measure = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const canvasRect = canvas.getBoundingClientRect();
        const origin = {
            x: canvasRect.left - canvas.scrollLeft,
            y: canvasRect.top - canvas.scrollTop,
        };

        const nodes = {};

        nodesRef.current.forEach(({ dot, card }, sequenceId) => {
            if (!dot || !card) return;

            nodes[sequenceId] = {
                dot: centreOf(dot.getBoundingClientRect(), origin),
                top: topEdgeOf(card.getBoundingClientRect(), origin),
            };
        });

        setMeasurements({
            nodes,
            size: { width: canvas.scrollWidth, height: canvas.scrollHeight },
        });
    }, [canvasRef]);

    useLayoutEffect(() => {
        measure();

        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const observer = new ResizeObserver(measure);
        observer.observe(canvas);

        return () => observer.disconnect();
    }, [measure, canvasRef, revision]);

    return useMemo(
        () => ({ ...measurements, registerDot, registerCard }),
        [measurements, registerDot, registerCard]
    );
};

export default useNodePositions;
