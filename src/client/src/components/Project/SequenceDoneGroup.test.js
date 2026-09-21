import React from 'react';
import { render, screen } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import { PinSelectionProvider } from './PinSelectionContext';
import SequenceDoneGroup from './SequenceDoneGroup';

const doneTodo = {
    id: 11,
    text: 'Calibrate the motors',
    status: 'complete',
    isPinned: true,
    completedAt: '2026-09-18T12:00:00.000Z',
};

const selectionValue = (overrides = {}) => ({
    mode: 'idle',
    selectedTodoIds: new Set(),
    isEligible: () => false,
    isSelected: () => false,
    toggle: jest.fn(),
    ...overrides,
});

const renderGroup = (selection = selectionValue()) => {
    const onReopenTodo = jest.fn();
    const onDeleteTodo = jest.fn();
    const rendered = render(
        <PinSelectionProvider value={selection}>
            <SequenceDoneGroup
                todos={[doneTodo]}
                onReopenTodo={onReopenTodo}
                onDeleteTodo={onDeleteTodo}
            />
        </PinSelectionProvider>
    );

    return { ...rendered, onReopenTodo, onDeleteTodo };
};

describe('SequenceDoneGroup pinning', () => {
    test('makes an eligible done row selectable without reopening or deleting it', async () => {
        // Arrange
        const selection = selectionValue({
            mode: 'unpin',
            isEligible: (todo) => todo.isPinned,
        });
        const { onReopenTodo, onDeleteTodo } = renderGroup(selection);

        // Act
        const control = screen.getByRole('button', { name: 'Unpin “Calibrate the motors”' });
        await click(control);

        // Assert
        expect(control).toHaveAttribute('aria-pressed', 'false');
        expect(selection.toggle).toHaveBeenCalledWith(11);
        expect(onReopenTodo).not.toHaveBeenCalled();
        expect(onDeleteTodo).not.toHaveBeenCalled();
    });

    test('shows a persistent decorative pin outside selection mode', () => {
        // Act
        const { container } = renderGroup();

        // Assert
        const icon = container.querySelector('.todo-pin-icon');
        expect(icon).toBeInTheDocument();
        expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
});
