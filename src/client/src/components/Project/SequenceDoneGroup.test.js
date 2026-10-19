import React from 'react';
import { render, screen } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import SequenceDoneGroup from './SequenceDoneGroup';

const doneTodo = {
    id: 11,
    text: 'Calibrate the motors',
    status: 'complete',
    isPinned: true,
    completedAt: '2026-09-18T12:00:00.000Z',
};

const renderGroup = () => {
    const onReopenTodo = jest.fn();
    const onDeleteTodo = jest.fn();
    const rendered = render(
        <SequenceDoneGroup
            todos={[doneTodo]}
            onReopenTodo={onReopenTodo}
            onDeleteTodo={onDeleteTodo}
        />
    );

    return { ...rendered, onReopenTodo, onDeleteTodo };
};

describe('SequenceDoneGroup rows', () => {
    test('shows no pin icon or overlay even when the to-do carries a stale isPinned flag', () => {
        // Act
        const { container } = renderGroup();

        // Assert
        expect(container.querySelector('.todo-pin-icon')).not.toBeInTheDocument();
        expect(container.querySelector('.pin-select-control')).not.toBeInTheDocument();
    });

    test('reopens and deletes through the row controls', async () => {
        // Arrange
        const { onReopenTodo, onDeleteTodo } = renderGroup();

        // Act
        await click(screen.getByRole('button', { name: 'Mark “Calibrate the motors” incomplete' }));
        await click(screen.getByRole('button', { name: 'Delete “Calibrate the motors”' }));

        // Assert
        expect(onReopenTodo).toHaveBeenCalledWith(doneTodo);
        expect(onDeleteTodo).toHaveBeenCalledWith(doneTodo);
    });
});
