import React from 'react';
import { render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import Canvas from './Canvas';

const layer = (id, title, position) => ({ id, projectId: 1, title, position });

const graphState = (overrides = {}) => ({
    project: { id: 1, title: 'Build a drone' },
    layers: {},
    sequences: {},
    todos: {},
    edges: {},
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
});
