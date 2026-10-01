import React from 'react';
import { render, screen, act } from '@testing-library/react';

import { click, type } from '../../testUtils/interact';

import ImportDialog from './ImportDialog';

const renderDialog = (props = {}) => {
    const onImport = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const utils = render(
        <ImportDialog
            title="Import layer"
            hint="Paste a schema."
            onImport={onImport}
            onClose={onClose}
            {...props}
        />
    );
    return { onImport, onClose, ...utils };
};

const importButton = () => screen.getByRole('button', { name: 'Import' });
const textarea = () => screen.getByLabelText('Schema');

describe('ImportDialog', () => {
    test('renders a modal dialog on the body with the title, hint and a focused Schema textarea', () => {
        // Act
        renderDialog();

        // Assert
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAccessibleName('Import layer');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog.parentElement.parentElement).toBe(document.body);
        expect(dialog.parentElement).toHaveClass('confirm-dialog-backdrop');
        expect(screen.getByText('Paste a schema.')).toBeInTheDocument();
        expect(textarea()).toHaveFocus();
    });

    test('Import is disabled while the textarea is blank', async () => {
        // Arrange
        renderDialog();
        expect(importButton()).toBeDisabled();

        // Act
        await type(textarea(), '   ');
        expect(importButton()).toBeDisabled();
        await type(textarea(), 'x');

        // Assert
        expect(importButton()).toBeEnabled();
    });

    test('Import hands the text to onImport once, then closes', async () => {
        // Arrange
        const { onImport, onClose } = renderDialog();
        await type(textarea(), 'abc');

        // Act
        await click(importButton());

        // Assert
        expect(onImport).toHaveBeenCalledTimes(1);
        expect(onImport).toHaveBeenCalledWith('abc');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('Import is disabled while the import is pending', async () => {
        // Arrange
        let resolve;
        const onImport = jest.fn(() => new Promise((r) => (resolve = r)));
        const { onClose } = renderDialog({ onImport });
        await type(textarea(), 'abc');

        // Act
        await click(importButton());

        // Assert
        expect(importButton()).toBeDisabled();
        expect(onClose).not.toHaveBeenCalled();
        await act(async () => resolve());
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('a rejection shows its message, keeps the text and does not close', async () => {
        // Arrange
        const onImport = jest.fn().mockRejectedValue(new Error('Bad schema'));
        const { onClose } = renderDialog({ onImport });
        await type(textarea(), 'abc');

        // Act
        await click(importButton());

        // Assert
        expect(screen.getByRole('alert')).toHaveTextContent('Bad schema');
        expect(textarea()).toHaveValue('abc');
        expect(onClose).not.toHaveBeenCalled();
        expect(importButton()).toBeEnabled();
    });

    test('Cancel closes without importing', async () => {
        // Arrange
        const { onImport, onClose } = renderDialog();

        // Act
        await click(screen.getByRole('button', { name: 'Cancel' }));

        // Assert
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onImport).not.toHaveBeenCalled();
    });

    test('Escape closes', () => {
        // Arrange
        const { onClose } = renderDialog();

        // Act
        screen
            .getByRole('dialog')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        // Assert
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('does not set state when the import settles after unmount', async () => {
        // Arrange
        let reject;
        const onImport = jest.fn(() => new Promise((_, r) => (reject = r)));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = renderDialog({ onImport });
        await type(textarea(), 'abc');
        await click(importButton());

        // Act
        unmount();
        await act(async () => reject(new Error('late')));

        // Assert
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
