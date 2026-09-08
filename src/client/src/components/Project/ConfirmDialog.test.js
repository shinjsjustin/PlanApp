import React from 'react';
import { render, screen } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import ConfirmDialog from './ConfirmDialog';

const renderDialog = (props = {}, options) =>
    render(
        <ConfirmDialog
            title="Delete this sequence?"
            message="Its to-dos are not deleted."
            confirmLabel="Delete sequence"
            onConfirm={jest.fn()}
            onCancel={jest.fn()}
            {...props}
        />,
        options
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

describe('ConfirmDialog stacking', () => {
    test('renders on the body, so nothing on the canvas can be painted over it', () => {
        // Arrange — a card that creates its own stacking context, as the canvas
        // rows and a dragged card both do.
        const card = document.createElement('div');
        card.style.transform = 'translate(0, 0)';
        card.style.zIndex = '1';
        document.body.appendChild(card);

        // Act
        renderDialog({}, { container: card });

        // Assert
        const dialog = screen.getByRole('dialog');
        expect(card.contains(dialog)).toBe(false);
        expect(document.body.contains(dialog)).toBe(true);
    });

    test('sits on a full-page backdrop, which is what covers the page beneath', () => {
        // Act
        renderDialog();

        // Assert
        const backdrop = screen.getByRole('dialog').parentElement;
        expect(backdrop).toHaveClass('confirm-dialog-backdrop');
        expect(backdrop.parentElement).toBe(document.body);
    });
});
