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

const todo = (id, sequenceId, status, position = 0, overrides = {}) => ({
    id,
    projectId: 1,
    sequenceId,
    text: `To-do ${id}`,
    status,
    position,
    isPinned: false,
    ...overrides,
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

    test('marks every sequence containing a pin active at the same time', () => {
        // Arrange
        const state = graphState({
            layers: { 10: layer(10, 'Learning', 0), 20: layer(20, 'Design', 1) },
            sequences: {
                100: sequence(100, 10, 'Learn aerodynamics'),
                200: sequence(200, 20, 'Design rotor system'),
            },
            todos: {
                1: todo(1, 100, 'complete', 0, { isPinned: true }),
                2: todo(2, 200, 'blocked', 0, { isPinned: true }),
            },
        });

        // Act
        const { container } = renderCanvas(state);

        // Assert
        const active = [...container.querySelectorAll('.sequence-card--active')].map(
            (card) => card.dataset.sequenceTitle
        );
        expect(active).toEqual(['Learn aerodynamics', 'Design rotor system']);
    });

    test('does not mark a sequence active when it contains no pin', () => {
        // Arrange
        const state = graphState({
            layers: { 10: layer(10, 'Learning', 0) },
            sequences: { 100: sequence(100, 10, 'Learn aerodynamics') },
            todos: { 1: todo(1, 100, 'incomplete') },
        });

        // Act
        const { container } = renderCanvas(state);

        // Assert
        expect(container.querySelector('.sequence-card--active')).toBeNull();
    });
});
