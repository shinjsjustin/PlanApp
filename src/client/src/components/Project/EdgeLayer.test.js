import React from 'react';
import { render } from '@testing-library/react';

import EdgeLayer from './EdgeLayer';

// The overlay takes its coordinates as a prop rather than measuring anything, so
// it can be checked in a runner with no layout: these are the coordinates a
// browser would have produced, and the question is only what gets rendered from
// them. Whether the real numbers are right is the phase 9 Playwright flow's job.

const nodes = {
    1: { dot: { x: 10, y: 20 }, top: { x: 10, y: 0 }, layerPosition: 0 },
    2: { dot: { x: 50, y: 120 }, top: { x: 50, y: 100 }, layerPosition: 1 },
    3: { dot: { x: 90, y: 220 }, top: { x: 90, y: 200 }, layerPosition: 2 },
};

const SIZE = { width: 800, height: 400 };

const renderLayer = (edges, overrides = {}) =>
    render(<EdgeLayer edges={edges} nodes={nodes} gutterX={760} size={SIZE} {...overrides} />);

const pathsIn = (container) => [...container.querySelectorAll('path')];

describe('EdgeLayer', () => {
    test('draws one path per edge', () => {
        // Arrange
        const edges = [
            { id: 7, parentId: 1, childId: 2 },
            { id: 8, parentId: 2, childId: 3 },
        ];

        // Act
        const { container } = renderLayer(edges);

        // Assert
        expect(pathsIn(container)).toHaveLength(2);
    });

    test('draws the path the geometry worked out', () => {
        // Arrange
        const edges = [{ id: 7, parentId: 1, childId: 2 }];

        // Act
        const { container } = renderLayer(edges);

        // Assert — the bezier from the parent's dot to the child's top edge
        expect(pathsIn(container)[0]).toHaveAttribute('d', 'M 10,20 C 10,60 50,60 50,100');
    });

    test('marks a skip edge apart from an adjacent one', () => {
        // Arrange — a skip edge takes the long way round through the gutter and
        // is drawn differently, so its kind has to reach the styling
        const edges = [
            { id: 7, parentId: 1, childId: 2 },
            { id: 8, parentId: 1, childId: 3 },
        ];

        // Act
        const { container } = renderLayer(edges);

        // Assert
        expect(pathsIn(container).map((path) => path.getAttribute('class'))).toEqual([
            'edge edge--adjacent',
            'edge edge--skip',
        ]);
    });

    test('sizes the overlay to the whole scrollable canvas', () => {
        // Arrange
        const edges = [{ id: 7, parentId: 1, childId: 2 }];

        // Act
        const { container } = renderLayer(edges);

        // Assert
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('width', '800');
        expect(svg).toHaveAttribute('height', '400');
        expect(svg).toHaveAttribute('viewBox', '0 0 800 400');
    });

    test('hides itself from assistive technology', () => {
        // Arrange — the lines restate the layer ordering the cards already show
        const edges = [{ id: 7, parentId: 1, childId: 2 }];

        // Act
        const { container } = renderLayer(edges);

        // Assert
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    test('renders nothing at all when there are no edges', () => {
        // Act
        const { container } = renderLayer([]);

        // Assert — an empty overlay would still be a box in the layout
        expect(container.querySelector('svg')).toBeNull();
    });

    test('renders nothing while the cards are still unmeasured', () => {
        // Arrange — the first paint runs before the layout effect measures
        const edges = [{ id: 7, parentId: 1, childId: 2 }];

        // Act
        const { container } = renderLayer(edges, { nodes: {} });

        // Assert
        expect(container.querySelector('svg')).toBeNull();
    });
});
