import React from 'react';
import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import { SortableSpotlight } from './DraggableTodo';
import { PinSelectionProvider } from './PinSelectionContext';

const spotlightTodo = {
    id: 21,
    projectId: 1,
    sequenceId: 100,
    text: 'Wire up token refresh',
    status: 'incomplete',
    isPinned: false,
    position: 0,
};

const renderSpotlight = ({ todo = spotlightTodo, selection, onComplete = jest.fn() }) =>
    render(
        <PinSelectionProvider value={selection}>
            <DndContext>
                <SortableSpotlight
                    todo={todo}
                    index={0}
                    isBlocked={false}
                    onComplete={onComplete}
                />
            </DndContext>
        </PinSelectionProvider>
    );

describe('SortableSpotlight pinning', () => {
    test('selects the spotlight to-do without completing it', async () => {
        // Arrange
        const onComplete = jest.fn();
        const selection = {
            mode: 'pin',
            selectedTodoIds: new Set(),
            isEligible: (todo) => !todo.isPinned,
            isSelected: () => false,
            toggle: jest.fn(),
        };
        renderSpotlight({ selection, onComplete });

        // Act
        await click(screen.getByRole('button', { name: 'Pin “Wire up token refresh”' }));

        // Assert
        expect(selection.toggle).toHaveBeenCalledWith(21);
        expect(onComplete).not.toHaveBeenCalled();
    });

    test('shows a persistent decorative pin outside selection mode', () => {
        // Arrange
        const selection = {
            mode: 'idle',
            selectedTodoIds: new Set(),
            isEligible: () => false,
            isSelected: () => false,
            toggle: jest.fn(),
        };

        // Act
        const { container } = renderSpotlight({
            todo: { ...spotlightTodo, isPinned: true },
            selection,
        });

        // Assert
        const icon = container.querySelector('.todo-pin-icon');
        expect(icon).toBeInTheDocument();
        expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
});
