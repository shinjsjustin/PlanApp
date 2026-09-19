import React from 'react';
import { render, screen } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import PinControls from './PinControls';

const selectionValue = (overrides = {}) => ({
    mode: 'idle',
    selectedTodoIds: new Set(),
    startPin: jest.fn(),
    startUnpin: jest.fn(),
    cancel: jest.fn(),
    confirm: jest.fn(),
    isSaving: false,
    ...overrides,
});

describe('PinControls', () => {
    test('disables confirmation while the selection is empty', () => {
        // Arrange & Act
        render(<PinControls selection={selectionValue({ mode: 'pin' })} />);

        // Assert
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });

    test('puts confirmation on the active operation and cancellation on the other', () => {
        // Arrange & Act
        const { rerender } = render(
            <PinControls
                selection={selectionValue({ mode: 'pin', selectedTodoIds: new Set([1]) })}
            />
        );

        // Assert
        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Confirm',
            'Cancel',
        ]);

        // Act
        rerender(
            <PinControls
                selection={selectionValue({ mode: 'unpin', selectedTodoIds: new Set([1]) })}
            />
        );

        // Assert
        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Cancel',
            'Confirm',
        ]);
    });

    test('cancels without confirming', async () => {
        // Arrange
        const selection = selectionValue({ mode: 'pin', selectedTodoIds: new Set([1]) });
        render(<PinControls selection={selection} />);

        // Act
        await click(screen.getByRole('button', { name: 'Cancel' }));

        // Assert
        expect(selection.cancel).toHaveBeenCalledTimes(1);
        expect(selection.confirm).not.toHaveBeenCalled();
    });
});
