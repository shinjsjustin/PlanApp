import {
    CANVAS_GUTTER_WIDTH,
    EDGE_KIND,
    EDGE_STUB,
    LANE_WIDTH,
    adjacentPath,
    assignLanes,
    edgePaths,
    gutterXFor,
    laneX,
    skipPath,
} from './geometry';

// The path math of spec section 4.6, tested as what it is: arithmetic.
//
// jsdom has no layout, so nothing here measures anything. Every function takes
// coordinates that a browser would have produced and returns a string or a
// number, which is exactly why the measuring lives in `useNodePositions` and the
// geometry lives here. Whether the numbers coming in are the right ones is the
// phase 9 Playwright flow's question, not this file's.

/**
 * Three stacked layers, one sequence in each, already "measured". A card's `top`
 * is the middle of its top edge — where an incoming edge lands — and its `dot`
 * is the connector beneath it, where an outgoing edge leaves.
 */
const nodes = {
    1: { dot: { x: 10, y: 20 }, top: { x: 10, y: 0 }, layerPosition: 0 },
    2: { dot: { x: 50, y: 120 }, top: { x: 50, y: 100 }, layerPosition: 1 },
    3: { dot: { x: 90, y: 220 }, top: { x: 90, y: 200 }, layerPosition: 2 },
};

const GUTTER_X = 400;

describe('assignLanes', () => {
    test('puts a lone skip edge in the first lane', () => {
        // Arrange
        const spans = [{ key: 'a', top: 0, bottom: 100 }];

        // Act
        const lanes = assignLanes(spans);

        // Assert
        expect(lanes.get('a')).toBe(0);
    });

    test('gives two overlapping skip edges lanes of their own', () => {
        // Arrange
        const spans = [
            { key: 'a', top: 0, bottom: 100 },
            { key: 'b', top: 50, bottom: 150 },
        ];

        // Act
        const lanes = assignLanes(spans);

        // Assert
        expect(lanes.get('a')).toBe(0);
        expect(lanes.get('b')).toBe(1);
    });

    test('gives three overlapping skip edges three lanes', () => {
        // Arrange
        const spans = [
            { key: 'a', top: 0, bottom: 300 },
            { key: 'b', top: 50, bottom: 150 },
            { key: 'c', top: 100, bottom: 200 },
        ];

        // Act
        const lanes = assignLanes(spans);

        // Assert
        expect([lanes.get('a'), lanes.get('b'), lanes.get('c')]).toEqual([0, 1, 2]);
    });

    test('reuses the first lane once an edge has ended', () => {
        // Arrange — `b` starts below where `a` finishes, so they never share a row
        const spans = [
            { key: 'a', top: 0, bottom: 100 },
            { key: 'b', top: 200, bottom: 300 },
        ];

        // Act
        const lanes = assignLanes(spans);

        // Assert
        expect(lanes.get('a')).toBe(0);
        expect(lanes.get('b')).toBe(0);
    });

    test('treats spans that merely touch as not overlapping', () => {
        // Arrange
        const spans = [
            { key: 'a', top: 0, bottom: 100 },
            { key: 'b', top: 100, bottom: 200 },
        ];

        // Act
        const lanes = assignLanes(spans);

        // Assert
        expect(lanes.get('b')).toBe(0);
    });

    test('assigns lanes by vertical order rather than by input order', () => {
        // Arrange — the same two overlapping spans, listed the other way round
        const spans = [
            { key: 'lower', top: 50, bottom: 150 },
            { key: 'upper', top: 0, bottom: 100 },
        ];

        // Act
        const lanes = assignLanes(spans);

        // Assert
        expect(lanes.get('upper')).toBe(0);
        expect(lanes.get('lower')).toBe(1);
    });

    test('does not mutate the spans it is given', () => {
        // Arrange
        const spans = [
            { key: 'b', top: 50, bottom: 150 },
            { key: 'a', top: 0, bottom: 100 },
        ];

        // Act
        assignLanes(spans);

        // Assert
        expect(spans.map((span) => span.key)).toEqual(['b', 'a']);
    });
});

describe('laneX', () => {
    test('places the first lane at the left of the gutter', () => {
        expect(laneX(GUTTER_X, 0)).toBe(GUTTER_X);
    });

    test('steps each further lane one width to the right', () => {
        expect(laneX(GUTTER_X, 2)).toBe(GUTTER_X + 2 * LANE_WIDTH);
    });
});

describe('gutterXFor', () => {
    test('puts the first lane inside the reserved right-hand column', () => {
        // Arrange — the gutter is the rightmost `CANVAS_GUTTER_WIDTH` of the
        // canvas, and lane 0 sits a little way into it rather than on its edge
        expect(CANVAS_GUTTER_WIDTH).toBe(48);

        // Act & Assert
        expect(gutterXFor(1000)).toBe(960);
    });

    test('keeps every lane within the gutter it was given', () => {
        // Arrange — three concurrent skip edges is the most the column holds
        const rightEdge = 1000;

        // Act
        const lanes = [0, 1, 2].map((index) => laneX(gutterXFor(rightEdge), index));

        // Assert
        expect(Math.min(...lanes)).toBeGreaterThanOrEqual(rightEdge - CANVAS_GUTTER_WIDTH);
        expect(Math.max(...lanes)).toBeLessThanOrEqual(rightEdge);
    });

    test('never runs off the left of a canvas narrower than the gutter', () => {
        expect(gutterXFor(10)).toBe(0);
    });
});

describe('adjacentPath', () => {
    test('draws a cubic bezier leaving and arriving vertically', () => {
        // Arrange
        const from = { x: 10, y: 20 };
        const to = { x: 50, y: 100 };

        // Act
        const d = adjacentPath(from, to);

        // Assert — both control points sit halfway down, directly under their
        // own endpoint, so the curve leaves the dot and meets the card straight
        expect(d).toBe('M 10,20 C 10,60 50,60 50,100');
    });

    test('stays a straight line when the two ends share a column', () => {
        expect(adjacentPath({ x: 30, y: 0 }, { x: 30, y: 80 })).toBe('M 30,0 C 30,40 30,40 30,80');
    });

    test('rounds coordinates rather than emitting float noise', () => {
        expect(adjacentPath({ x: 10.005, y: 0 }, { x: 20, y: 51 })).toBe(
            'M 10.01,0 C 10.01,25.5 20,25.5 20,51'
        );
    });
});

describe('skipPath', () => {
    test('routes out of the dot, across to the lane, down, and back in', () => {
        // Arrange
        const from = { x: 10, y: 20 };
        const to = { x: 90, y: 200 };

        // Act
        const d = skipPath(from, to, 400);

        // Assert — a stub clear of the dot, right to the lane, down past the
        // layers in between, left above the card, then down into its top edge
        expect(d).toBe('M 10,20 L 10,32 L 400,32 L 400,188 L 90,188 L 90,200');
        expect(EDGE_STUB).toBe(12);
    });

    test('routes the same way when the child sits left of the parent', () => {
        // Arrange
        const from = { x: 200, y: 20 };
        const to = { x: 40, y: 200 };

        // Act
        const d = skipPath(from, to, 400);

        // Assert
        expect(d).toBe('M 200,20 L 200,32 L 400,32 L 400,188 L 40,188 L 40,200');
    });
});

describe('edgePaths', () => {
    test('draws an edge between neighbouring layers as a bezier', () => {
        // Arrange
        const edges = [{ id: 7, parentId: 1, childId: 2 }];

        // Act
        const paths = edgePaths({ edges, nodes, gutterX: GUTTER_X });

        // Assert
        expect(paths).toEqual([
            { id: 7, kind: EDGE_KIND.adjacent, d: 'M 10,20 C 10,60 50,60 50,100' },
        ]);
    });

    test('routes an edge that skips a layer down the gutter', () => {
        // Arrange
        const edges = [{ id: 8, parentId: 1, childId: 3 }];

        // Act
        const paths = edgePaths({ edges, nodes, gutterX: GUTTER_X });

        // Assert
        expect(paths).toEqual([
            {
                id: 8,
                kind: EDGE_KIND.skip,
                d: 'M 10,20 L 10,32 L 400,32 L 400,188 L 90,188 L 90,200',
            },
        ]);
    });

    test('gives two skip edges that run alongside each other separate lanes', () => {
        // Arrange — both leave the top layer and land on the bottom one, so
        // sharing a lane would draw them over one another
        const wide = {
            ...nodes,
            4: { dot: { x: 130, y: 30 }, top: { x: 130, y: 10 }, layerPosition: 0 },
            5: { dot: { x: 170, y: 230 }, top: { x: 170, y: 210 }, layerPosition: 2 },
        };
        const edges = [
            { id: 1, parentId: 1, childId: 3 },
            { id: 2, parentId: 4, childId: 5 },
        ];

        // Act
        const paths = edgePaths({ edges, nodes: wide, gutterX: GUTTER_X });

        // Assert
        expect(paths[0].d).toContain(`L ${GUTTER_X},`);
        expect(paths[1].d).toContain(`L ${GUTTER_X + LANE_WIDTH},`);
    });

    test('leaves out an edge whose ends have not been measured yet', () => {
        // Arrange — the first paint runs before the layout effect measures
        const edges = [
            { id: 9, parentId: 1, childId: 2 },
            { id: 10, parentId: 1, childId: 999 },
        ];

        // Act
        const paths = edgePaths({ edges, nodes, gutterX: GUTTER_X });

        // Assert
        expect(paths.map((path) => path.id)).toEqual([9]);
    });

    test('returns nothing when nothing has been measured', () => {
        expect(
            edgePaths({ edges: [{ id: 1, parentId: 1, childId: 2 }], nodes: {}, gutterX: 0 })
        ).toEqual([]);
    });

    test('does not mutate the edges or nodes it is given', () => {
        // Arrange
        const edges = [{ id: 8, parentId: 1, childId: 3 }];
        const before = JSON.stringify({ edges, nodes });

        // Act
        edgePaths({ edges, nodes, gutterX: GUTTER_X });

        // Assert
        expect(JSON.stringify({ edges, nodes })).toBe(before);
    });
});
