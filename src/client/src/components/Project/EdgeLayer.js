import React from 'react';

import { edgePaths } from '../../lib/geometry';

// The edges, drawn (spec section 4.6).
//
// An SVG overlay stretched across the canvas and sitting behind the cards, so a
// line never covers a title or swallows a click meant for a card. The styling
// makes it `pointer-events: none` for the same reason: an edge is created and
// removed through connect mode, never by clicking the line.
//
// Everything about where the lines go was settled before this component ran —
// `useNodePositions` measured, `edgePaths` did the arithmetic. This turns the
// result into elements and nothing else, which is what lets the interesting part
// be tested in a runner with no layout.

const EdgeLayer = ({ edges, nodes, gutterX, size }) => {
    const paths = edgePaths({ edges, nodes, gutterX });

    // Nothing to draw, or nothing measured yet. An empty overlay would still be
    // a box in the layout, so it is left out entirely rather than sized zero.
    if (paths.length === 0) return null;

    return (
        <svg
            className="edge-layer"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            // The lines restate an ordering the stacked layers already show, so
            // there is nothing here for a screen reader that the page does not
            // already say more plainly.
            aria-hidden="true"
            focusable="false"
        >
            {paths.map((path) => (
                <path key={path.id} className={`edge edge--${path.kind}`} d={path.d} fill="none" />
            ))}
        </svg>
    );
};

export default EdgeLayer;
