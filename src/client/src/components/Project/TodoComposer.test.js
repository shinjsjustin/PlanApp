import React from 'react';
import { render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click, type } from '../../testUtils/interact';

import TodoComposer from './TodoComposer';

// The one composer both the unorganized panel and an expanded sequence card use
// (spec section 4.5). What it has to get right is rapid entry: Enter adds the
// to-do, the field clears, and focus stays put so the next one can be typed
// straight away without reaching for the mouse (spec section 4.7).

const graphValue = () => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: {},
        sequences: {
            100: { id: 100, projectId: 1, layerId: 10, title: 'Learn aerodynamics', position: 0 },
        },
        todos: {
            1000: {
                id: 1000,
                projectId: 1,
                sequenceId: null,
                text: 'Loose',
                status: 'incomplete',
                position: 0,
            },
        },
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const renderComposer = (props = {}) => {
    const value = graphValue();

    const rendered = render(
        <ProjectProvider value={value}>
            <TodoComposer label="New to-do" {...props} />
        </ProjectProvider>
    );

    return { ...rendered, value };
};

const field = () => screen.getByRole('textbox', { name: /new to-do/i });

describe('TodoComposer', () => {
    test('adds the typed to-do when Enter is pressed', async () => {
        // Arrange
        const { value } = renderComposer();

        // Act
        await type(field(), 'Read about lift{enter}');

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'todos',
            expect.objectContaining({
                path: '/projects/1/todos',
                body: { text: 'Read about lift', sequenceId: null },
            })
        );
    });

    test('appends to the end of the unorganized panel', async () => {
        // Arrange — the panel already holds one loose to-do at position 0.
        const { value } = renderComposer();

        // Act
        await type(field(), 'Read about lift{enter}');

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'todos',
            expect.objectContaining({
                optimistic: expect.objectContaining({
                    sequenceId: null,
                    status: 'incomplete',
                    position: 1,
                }),
            })
        );
    });

    test('files the to-do into the sequence it belongs to', async () => {
        // Arrange
        const { value } = renderComposer({ sequenceId: 100 });

        // Act
        await type(field(), 'Read about drag{enter}');

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'todos',
            expect.objectContaining({
                body: { text: 'Read about drag', sequenceId: 100 },
                optimistic: expect.objectContaining({ sequenceId: 100, position: 0 }),
            })
        );
    });

    test('clears the field so the next to-do can be typed', async () => {
        // Arrange
        renderComposer();

        // Act
        await type(field(), 'Read about lift{enter}');

        // Assert
        expect(field()).toHaveValue('');
    });

    test('keeps focus so to-dos can be typed in one after another', async () => {
        // Arrange
        renderComposer();

        // Act
        await type(field(), 'Read about lift{enter}');

        // Assert
        expect(field()).toHaveFocus();
    });

    test('takes several to-dos in a row without any interaction between them', async () => {
        // Arrange
        const { value } = renderComposer();

        // Act
        await type(field(), 'Read about lift{enter}');
        await type(field(), 'Read about drag{enter}');

        // Assert
        expect(value.createEntity).toHaveBeenCalledTimes(2);
        expect(value.createEntity.mock.calls[1][1].body).toEqual({
            text: 'Read about drag',
            sequenceId: null,
        });
    });

    test('trims the text it submits', async () => {
        // Arrange
        const { value } = renderComposer();

        // Act
        await type(field(), '   Read about lift   {enter}');

        // Assert
        expect(value.createEntity.mock.calls[0][1].body.text).toBe('Read about lift');
    });

    test('rejects whitespace-only input inline, without a request', async () => {
        // Arrange
        const { value } = renderComposer();

        // Act
        await type(field(), '   {enter}');

        // Assert
        expect(value.createEntity).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent(/needs some text/i);
    });

    test('rejects an empty field inline, without a request', async () => {
        // Arrange
        const { value } = renderComposer();

        // Act
        await click(screen.getByRole('button', { name: /add/i }));

        // Assert
        expect(value.createEntity).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    test('keeps focus on the field after a rejected submission', async () => {
        // Arrange
        renderComposer();

        // Act
        await type(field(), '   {enter}');

        // Assert
        expect(field()).toHaveFocus();
    });

    test('drops the complaint as soon as something is typed', async () => {
        // Arrange
        renderComposer();
        await type(field(), '   {enter}');

        // Act
        await type(field(), 'R');

        // Assert
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('adds the to-do from the add button as well as from Enter', async () => {
        // Arrange
        const { value } = renderComposer();
        await type(field(), 'Read about lift');

        // Act
        await click(screen.getByRole('button', { name: /add/i }));

        // Assert
        expect(value.createEntity).toHaveBeenCalledTimes(1);
        expect(field()).toHaveValue('');
    });

    test('returns focus to the field after the add button is used', async () => {
        // Arrange
        renderComposer();
        await type(field(), 'Read about lift');

        // Act
        await click(screen.getByRole('button', { name: /add/i }));

        // Assert
        expect(field()).toHaveFocus();
    });
});
