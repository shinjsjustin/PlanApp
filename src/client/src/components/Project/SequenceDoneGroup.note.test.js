import React from 'react';
import { render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import { PinSelectionProvider } from './PinSelectionContext';
import SequenceDoneGroup from './SequenceDoneGroup';

const doneTodo = {
    id: 11,
    projectId: 1,
    sequenceId: 100,
    text: 'Calibrate the motors',
    status: 'complete',
    note: 'Use the bench rig',
    isPinned: false,
    completedAt: '2026-09-18T12:00:00.000Z',
};

const graphValue = (todo) => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: {},
        sequences: {},
        todos: { [todo.id]: todo },
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const selectionValue = (overrides = {}) => ({
    mode: 'idle',
    selectedTodoIds: new Set(),
    isEligible: () => false,
    isSelected: () => false,
    toggle: jest.fn(),
    ...overrides,
});

const renderGroup = (todo = doneTodo, selection = selectionValue()) => {
    const onReopenTodo = jest.fn();
    const onDeleteTodo = jest.fn();
    render(
        <ProjectProvider value={graphValue(todo)}>
            <PinSelectionProvider value={selection}>
                <SequenceDoneGroup
                    todos={[todo]}
                    onReopenTodo={onReopenTodo}
                    onDeleteTodo={onDeleteTodo}
                />
            </PinSelectionProvider>
        </ProjectProvider>
    );

    return { onReopenTodo, onDeleteTodo };
};

const noteField = () => screen.queryByRole('textbox', { name: 'Note for “Calibrate the motors”' });
const textToggle = () => screen.getByText('Calibrate the motors');

describe('SequenceDoneGroup notes', () => {
    test('opens the note under the row on clicking the text and closes it on a second click', async () => {
        // Arrange
        renderGroup();
        expect(noteField()).not.toBeInTheDocument();

        // Act
        await click(textToggle());

        // Assert
        expect(noteField()).toHaveValue('Use the bench rig');
        expect(textToggle()).toHaveAttribute('aria-expanded', 'true');

        // Act
        await click(textToggle());

        // Assert
        expect(noteField()).not.toBeInTheDocument();
    });

    test('shows the arrow button only when the todo has a note, and it toggles the note', async () => {
        // Arrange
        renderGroup();
        const arrow = screen.getByRole('button', { name: 'Show note for “Calibrate the motors”' });

        // Act
        await click(arrow);

        // Assert
        expect(noteField()).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Hide note for “Calibrate the motors”' })
        ).toBeInTheDocument();
    });

    test('offers no arrow button for a todo without a note', () => {
        // Act
        renderGroup({ ...doneTodo, note: null });

        // Assert
        expect(screen.queryByRole('button', { name: /note for/i })).not.toBeInTheDocument();
    });

    test('does not open the note when reopening or deleting the row', async () => {
        // Arrange
        const { onReopenTodo, onDeleteTodo } = renderGroup();

        // Act
        await click(screen.getByRole('button', { name: 'Mark “Calibrate the motors” incomplete' }));
        await click(screen.getByRole('button', { name: 'Delete “Calibrate the motors”' }));

        // Assert
        expect(onReopenTodo).toHaveBeenCalledTimes(1);
        expect(onDeleteTodo).toHaveBeenCalledTimes(1);
        expect(noteField()).not.toBeInTheDocument();
    });

    test('does not open a note while pin selection is running', async () => {
        // Arrange
        renderGroup(doneTodo, selectionValue({ mode: 'pin' }));

        // Act
        await click(textToggle());

        // Assert
        expect(noteField()).not.toBeInTheDocument();
    });
});
