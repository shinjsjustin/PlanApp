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
// Scrolling is the one movement the observer cannot see. A layer row scrolls
// sideways when it holds more sequences than fit, and a card carried along by
// that has changed position without anything changing size. One capture-phase
// scroll listener on the canvas covers every row, and `isClipped` records which
// cards it pushed out of sight so `edgePaths` can leave their edges undrawn.
//
// Measuring belongs here and path math belongs in `lib/geometry`. That split is
// why the maths is unit-tested and this is left to the Playwright flow: jsdom
// reports every rectangle as zero, and a zero rect against zero bounds satisfies
// `isClippedIn`'s `<=`, so every card in a row reads as clipped and every edge
// is dropped. A jsdom test of this would not fail loudly — it would quietly
// report an empty graph and look plausible. Do not assert on clipping without a
// real browser.

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

/**
 * The row a card scrolls inside, or null when it is not in one.
 *
 * Only `.layer-row-sequences` scrolls; everything else on the canvas is laid out
 * by the page. Selecting the class rather than walking up looking for a computed
 * `overflow` keeps this cheap enough to run for every card on every measure.
 */
const scrollerOf = (card) => card.closest('.layer-row-sequences');

/**
 * Whether a card has been scrolled out of the row that holds it.
 *
 * Horizontal only: rows scroll sideways and nothing scrolls them vertically.
 * A card with no scrolling ancestor is never clipped, which is the honest answer
 * for one rendered outside a row — better a line drawn than a card silently
 * dropped off the graph.
 */
const isClippedIn = (rect, bounds) => {
    if (!bounds) return false;

    return rect.right <= bounds.left || rect.left >= bounds.right;
};

/**
 * Holds an endpoint inside the row that owns it.
 *
 * A card only half scrolled out is not clipped — part of it is still on screen,
 * so its edge is still worth drawing — but its centre can be most of a card's
 * width outside the row, and a line drawn to there runs out across the gutter
 * and whatever else is beside the band. Clamping to the row's own bounds ends
 * the line at the edge the card is sliding behind, which is where the card
 * appears to be.
 *
 * Only x, for the same reason `isClippedIn` only looks at x.
 */
const clampToRow = (point, bounds, origin) => {
    if (!bounds) return point;

    const left = bounds.left - origin.x;
    const right = bounds.right - origin.x;

    return { ...point, x: Math.min(Math.max(point.x, left), right) };
};

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

        /* One rect per scrolling row, not one per card: every card in a row
         * resolves to the same scroller and would otherwise re-read the same
         * bounds for each of its siblings. */
        const boundsByScroller = new Map();
        const boundsOf = (scroller) => {
            if (!scroller) return null;
            if (!boundsByScroller.has(scroller)) {
                boundsByScroller.set(scroller, scroller.getBoundingClientRect());
            }

            return boundsByScroller.get(scroller);
        };

        nodesRef.current.forEach(({ dot, card }, sequenceId) => {
            if (!dot || !card) return;

            const cardRect = card.getBoundingClientRect();
            const bounds = boundsOf(scrollerOf(card));

            nodes[sequenceId] = {
                dot: clampToRow(centreOf(dot.getBoundingClientRect(), origin), bounds, origin),
                top: clampToRow(topEdgeOf(cardRect, origin), bounds, origin),
                isClipped: isClippedIn(cardRect, bounds),
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

        /**
         * A card moving inside a scrolled row moves without resizing anything,
         * so the observer above never hears about it and every path to that card
         * goes stale.
         *
         * One listener covers every row. Scroll events do not bubble, but they
         * DO capture, so a capture-phase listener on the canvas catches each of
         * its descendants' scrollers — including rows that appear later, with no
         * per-row registration to keep in step.
         *
         * Coalesced onto a frame: a scroll fires far faster than a re-measure of
         * every card is worth doing, and `measure` calls `setState`.
         */
        let frame = null;
        const onScroll = () => {
            if (frame !== null) return;

            frame = requestAnimationFrame(() => {
                frame = null;
                measure();
            });
        };

        canvas.addEventListener('scroll', onScroll, true);

        return () => {
            observer.disconnect();
            canvas.removeEventListener('scroll', onScroll, true);
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [measure, canvasRef, revision]);

    return useMemo(
        () => ({ ...measurements, registerDot, registerCard }),
        [measurements, registerDot, registerCard]
    );
};

export default useNodePositions;
