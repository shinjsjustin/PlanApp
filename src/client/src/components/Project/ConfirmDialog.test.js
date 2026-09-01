import React from 'react';
import { render, screen } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import ConfirmDialog from './ConfirmDialog';

const renderDialog = (props = {}) =>
    render(
        <ConfirmDialog
            title="Delete this sequence?"
            message="Its to-dos are not deleted."
            confirmLabel="Delete sequence"
            onConfirm={jest.fn()}
            onCancel={jest.fn()}
            {...props}
        />
    );

describe('ConfirmDialog', () => {
    test('states what is about to happen', () => {
        // Act
        renderDialog();

        // Assert
        expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete this sequence?');
        expect(screen.getByText('Its to-dos are not deleted.')).toBeInTheDocument();
    });

    test('confirms only when the confirm button is pressed', async () => {
        // Arrange
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        renderDialog({ onConfirm, onCancel });

        // Act
        await click(screen.getByRole('button', { name: 'Delete sequence' }));

        // Assert
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    test('cancels without confirming', async () => {
        // Arrange
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        renderDialog({ onConfirm, onCancel });

        // Act
        await click(screen.getByRole('button', { name: /cancel/i }));

        // Assert
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    test('Escape cancels, so the destructive button is never the only way out', () => {
        // Arrange
        const onCancel = jest.fn();
        renderDialog({ onCancel });

        // Act
        screen
            .getByRole('dialog')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        // Assert
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
