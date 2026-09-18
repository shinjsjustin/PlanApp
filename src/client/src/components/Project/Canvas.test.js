import React from 'react';
import { render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import Canvas from './Canvas';

const layer = (id, title, position) => ({ id, projectId: 1, title, position });

const sequence = (id, layerId, title, position = 0) => ({
    id,
    projectId: 1,
    layerId,
    title,
    description: null,
    isBlocked: false,
    position,
});

const todo = (id, sequenceId, status, position = 0) => ({
    id,
    projectId: 1,
    sequenceId,
    text: `To-do ${id}`,
    status,
    position,
});

const graphState = (overrides = {}) => ({
    project: { id: 1, title: 'Build a drone' },
    layers: {},
    sequences: {},
    todos: {},
    ...overrides,
});

const renderCanvas = (state) => {
    const value = {
        state,
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
    };

    const rendered = render(
        <ProjectProvider value={value}>
            <Canvas />
        </ProjectProvider>
    );

    return { ...rendered, value };
};

describe('Canvas', () => {
    test('stacks the layers top to bottom by position', () => {
        // Arrange
        const state = graphState({
            layers: {
                20: layer(20, 'Design', 1),
                10: layer(10, 'Learning', 0),
                30: layer(30, 'Build', 2),
            },
        });

        // Act
        renderCanvas(state);

        // Assert — each layer is a labelled region, since its title is now an
        // editable field rather than static heading text.
        const titles = screen
            .getAllByRole('region')
            .map((region) => region.getAttribute('aria-label'));
        expect(titles).toEqual(['Learning', 'Design', 'Build']);
    });

    test('passes each layer only its own sequences', () => {
        // Arrange
        const state = graphState({
            layers: { 10: layer(10, 'Learning', 0), 20: layer(20, 'Design', 1) },
            sequences: {
                100: {
                    id: 100,
                    projectId: 1,
                    layerId: 20,
                    title: 'Design rotor system',
                    description: null,
                    isBlocked: false,
                    position: 0,
                },
            },
        });

        // Act
        renderCanvas(state);

        // Assert
        expect(screen.getByDisplayValue('Design rotor system')).toBeInTheDocument();
        expect(screen.getAllByText(/no sequences/i)).toHaveLength(1);
    });

    test('prompts for a first layer when the project has none', () => {
        // Act
        renderCanvas(graphState());

        // Assert
        expect(screen.getByText(/no layers/i)).toBeInTheDocument();
    });

    test('adds the first layer from the empty state', async () => {
        // Arrange
        const { value } = renderCanvas(graphState());

        // Act
        await click(screen.getByRole('button', { name: /add.*first layer/i }));

        // Assert — no neighbour to insert below, so it appends.
        expect(value.createEntity).toHaveBeenCalledWith(
            'layers',
            expect.objectContaining({ path: '/projects/1/layers', body: {} })
        );
    });

    // The canvas shows layers and sequences and nothing between them: there are
    // no dependency lines to draw, so there is no overlay to measure against, no
    // handle to start one from, and no mode the canvas can be caught in.
    describe('without connections', () => {
        const twoLayerState = () =>
            graphState({
                layers: { 10: layer(10, 'Learning', 0), 20: layer(20, 'Design', 1) },
                sequences: {
                    100: sequence(100, 10, 'Learn aerodynamics'),
                    200: sequence(200, 20, 'Design rotor system'),
                },
            });

        test('draws no edge overlay', () => {
            // Act
            const { container } = renderCanvas(twoLayerState());

            // Assert
            expect(container.querySelector('.edge-layer')).toBeNull();
        });

        test('gives no sequence a connector dot', () => {
            // Act
            renderCanvas(twoLayerState());

            // Assert
            expect(screen.queryByRole('button', { name: /connect from/i })).toBeNull();
        });

        test('offers no card as a connect target', () => {
            // Act
            renderCanvas(twoLayerState());

            // Assert
            expect(screen.queryByRole('button', { name: /connect to/i })).toBeNull();
        });

        test('marks no card with a connect state', () => {
            // Act
            const { container } = renderCanvas(twoLayerState());

            // Assert
            expect(container.querySelector('[data-connect]')).toBeNull();
            expect(container.querySelector('.canvas--connecting')).toBeNull();
        });
    });

    // The ring is exclusive and the canvas is the only thing that can see enough
    // of the graph to place it: one frontier sequence per layer, top to bottom,
    // and the first of those holding something to pick up wears it.
    test('gives the spotlight to the first startable sequence', () => {
        // Arrange — the top layer's sequence is finished, so the ring belongs to
        // the layer below it.
        const state = graphState({
            layers: { 10: layer(10, 'Learning', 0), 20: layer(20, 'Design', 1) },
            sequences: {
                100: sequence(100, 10, 'Learn aerodynamics'),
                200: sequence(200, 20, 'Design rotor system'),
            },
            todos: {
                1: todo(1, 100, 'complete'),
                2: todo(2, 200, 'incomplete'),
            },
        });

        // Act
        const { container } = renderCanvas(state);

        // Assert
        const active = container.querySelectorAll('[data-state="active"]');
        expect(active).toHaveLength(1);
        expect(active[0]).toHaveAttribute('data-sequence-title', 'Design rotor system');
    });
});
