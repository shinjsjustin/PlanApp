// Where the edges go (spec section 4.6).
//
// Every function here is a pure function of coordinates something else measured.
// No DOM, no refs, no React — which is the whole point: jsdom has no layout, so
// path math that reached for a node could not be tested at all, while arithmetic
// can be checked exactly. `useNodePositions` does the measuring; this decides
// what to draw with the numbers it produces.
//
// Two shapes of edge, because two situations look wrong drawn the same way:
//
//   Neighbouring layers — a vertical cubic bezier straight from the parent's
//   connector dot down to the middle of the child's top edge. Short, and it
//   reads as one thing flowing into the next.
//
//   Skipping a layer — a bezier would sweep across the cards in between and
//   look like it touched them. Instead the edge leaves the dot, turns right into
//   a lane in the right-hand gutter, runs down past the layers it skips, then
//   turns back in above the child. Concurrent skip edges each get their own lane
//   so they never sit on top of one another.

/** How far a skip edge runs straight before its first and after its last turn. */
export const EDGE_STUB = 12;

/** Horizontal distance between neighbouring gutter lanes. */
export const LANE_WIDTH = 16;

/**
 * The reserved right-hand column skip edges run down, in pixels.
 *
 * This is `--canvas-gutter` from `Styling/Project.css` at the default root font
 * size: 3rem. The two are written down twice because CSS reserves the column and
 * this places lines inside it, and neither can read the other's number — so both
 * carry a comment pointing here.
 */
export const CANVAS_GUTTER_WIDTH = 48;

/** How far into the gutter the first lane sits, rather than on its very edge. */
export const LANE_INSET = 8;

/**
 * Where lane 0 goes, given how wide the canvas is.
 *
 * The gutter is the rightmost `CANVAS_GUTTER_WIDTH` of the canvas, and lanes
 * step right from there — so with the inset above, three concurrent skip edges
 * fit inside the column before a fourth would reach its right edge. A canvas
 * narrower than its own gutter is clamped to zero rather than routing edges off
 * the left; that only happens mid-layout, before anything is worth drawing.
 */
export const gutterXFor = (canvasWidth) =>
    Math.max(0, canvasWidth - CANVAS_GUTTER_WIDTH + LANE_INSET);

export const EDGE_KIND = {
    adjacent: 'adjacent',
    skip: 'skip',
};

/**
 * Trims float noise off a measured coordinate. `getBoundingClientRect` returns
 * fractions, and a path full of `10.000000000000002` is unreadable in the DOM
 * and impossible to assert on.
 */
const round = (value) => Math.round(value * 100) / 100;

const point = ({ x, y }) => `${round(x)},${round(y)}`;

/** The x of a gutter lane. Lane 0 is leftmost; each further one steps right. */
export const laneX = (gutterX, laneIndex) => gutterX + laneIndex * LANE_WIDTH;

/**
 * Lane numbers for skip edges, so that two edges whose vertical spans overlap
 * never share a lane.
 *
 * This is interval graph colouring, and the greedy pass is optimal for it: take
 * the spans top to bottom and give each the first lane whose previous occupant
 * has already finished above it. Spans that merely touch — one ending exactly
 * where the next begins — share a lane, because they never occupy the same row.
 *
 * `spans` is `[{ key, top, bottom }]` and comes back untouched; the answer is a
 * `Map` from key to lane index.
 */
export const assignLanes = (spans) => {
    const ordered = [...spans].sort((a, b) => a.top - b.top || a.bottom - b.bottom);

    // `laneEnds[i]` is the bottom of the last span placed in lane i.
    const laneEnds = [];

    return ordered.reduce((lanes, span) => {
        const free = laneEnds.findIndex((end) => end <= span.top);
        const index = free === -1 ? laneEnds.length : free;

        laneEnds[index] = span.bottom;

        return lanes.set(span.key, index);
    }, new Map());
};

/**
 * An edge between neighbouring layers: a cubic bezier from the parent's dot to
 * the child's top edge.
 *
 * Both control points sit halfway down the gap, each directly below its own
 * endpoint, so the curve leaves the dot pointing straight down and meets the
 * card pointing straight down too. That vertical tangent at each end is what
 * makes it read as flowing out of one card and into the other rather than
 * merely touching both.
 */
export const adjacentPath = (from, to) => {
    const midY = (from.y + to.y) / 2;

    return (
        `M ${point(from)} C ${point({ x: from.x, y: midY })} ` +
        `${point({ x: to.x, y: midY })} ${point(to)}`
    );
};

/**
 * An edge that skips one or more layers: orthogonal, out through the gutter.
 *
 * Down a stub to clear the dot, right to the lane, down past everything in
 * between, left to sit above the child, then down into its top edge. The child
 * may be to the left of the parent — the same six points handle it, the third
 * and fourth segments simply run the other way.
 */
export const skipPath = (from, to, x) => {
    const outY = from.y + EDGE_STUB;
    const inY = to.y - EDGE_STUB;

    const corners = [
        { x: from.x, y: outY },
        { x, y: outY },
        { x, y: inY },
        { x: to.x, y: inY },
        to,
    ];

    return `M ${point(from)} ${corners.map((corner) => `L ${point(corner)}`).join(' ')}`;
};

const isSkip = (parent, child) => child.layerPosition - parent.layerPosition > 1;

/**
 * One `{ id, kind, d }` per edge that can be drawn.
 *
 * `nodes` maps sequence id to `{ dot, top, layerPosition, isClipped }`. An edge
 * whose ends are not both in it is left out rather than drawn from a guess: on
 * the first paint the layout effect has not measured anything yet, and a
 * sequence removed from the graph can outlive its edges by a render. Neither is
 * a failure — it is simply not knowing yet where to put the line, and inventing
 * coordinates would draw an edge somewhere that means nothing.
 *
 * An edge with a CLIPPED end is left out for a different reason. Layer rows
 * scroll sideways, and a card pushed out of its row is still somewhere
 * geometrically — but this overlay is stretched across the whole canvas, not
 * clipped per row, so a line drawn to that card would cut across the bands
 * above and below it. `isClipped` is set by `useNodePositions`, which is the
 * only thing that can see a scroll position.
 *
 * Lanes are assigned after both filters, so an edge nobody can see does not
 * reserve a gutter lane and push a visible one sideways.
 */
export const edgePaths = ({ edges, nodes, gutterX }) => {
    const drawable = edges
        .map((edge) => ({ edge, parent: nodes[edge.parentId], child: nodes[edge.childId] }))
        .filter(({ parent, child }) => parent && child)
        .filter(({ parent, child }) => !parent.isClipped && !child.isClipped);

    const skipSpans = drawable
        .filter(({ parent, child }) => isSkip(parent, child))
        .map(({ edge, parent, child }) => ({
            key: edge.id,
            top: parent.dot.y,
            bottom: child.top.y,
        }));

    const lanes = assignLanes(skipSpans);

    return drawable.map(({ edge, parent, child }) =>
        isSkip(parent, child)
            ? {
                  id: edge.id,
                  kind: EDGE_KIND.skip,
                  d: skipPath(parent.dot, child.top, laneX(gutterX, lanes.get(edge.id))),
              }
            : {
                  id: edge.id,
                  kind: EDGE_KIND.adjacent,
                  d: adjacentPath(parent.dot, child.top),
              }
    );
};
