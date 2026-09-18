import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NotePopover from './NotePopover';

const draft = { startMinutes: 540, durationMinutes: 60 };

const renderPopover = (props = {}) => {
    const handlers = {
        onSave: jest.fn(),
        onCancel: jest.fn(),
        onDelete: jest.fn(),
    };

    render(<NotePopover range={draft} {...handlers} {...props} />);

    return handlers;
};

describe('NotePopover', () => {
    test('opens focused, so you can just type', () => {
        // Act
        renderPopover();

        // Assert
        expect(screen.getByLabelText('Note')).toHaveFocus();
    });

    test('shows the range the note will cover', () => {
        // Act
        renderPopover();

        // Assert
        expect(screen.getByText('09:00–10:00')).toBeInTheDocument();
    });

    test('saves the typed text', async () => {
        // Arrange
        const { onSave } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        // Assert
        expect(onSave).toHaveBeenCalledWith('on call');
    });

    test('Enter saves without reaching for the button', async () => {
        // Arrange
        const { onSave } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call{Enter}');

        // Assert
        expect(onSave).toHaveBeenCalledWith('on call');
    });

    test('trims what it saves', async () => {
        // Arrange
        const { onSave } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), '  on call  {Enter}');

        // Assert
        expect(onSave).toHaveBeenCalledWith('on call');
    });

    test('saving nothing cancels instead', async () => {
        // Arrange — an empty save creates no note at all (design section 8.2)
        const { onSave, onCancel } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), '   {Enter}');

        // Assert
        expect(onSave).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalled();
    });

    test('Escape cancels', async () => {
        // Arrange
        const { onSave, onCancel } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call{Escape}');

        // Assert
        expect(onSave).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalled();
    });

    test('a click outside cancels', async () => {
        // Arrange
        const { onCancel } = renderPopover();

        // Act
        await userEvent.click(document.body);

        // Assert
        expect(onCancel).toHaveBeenCalled();
    });

    test('has no Delete when the note does not exist yet', () => {
        // Act
        renderPopover({ onDelete: null });

        // Assert
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    test('deletes an existing note', async () => {
        // Arrange
        const { onDelete } = renderPopover({ text: 'on call' });

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // Assert
        expect(onDelete).toHaveBeenCalled();
    });

    test('starts with the existing text when there is one', () => {
        // Act
        renderPopover({ text: 'kids at home' });

        // Assert
        expect(screen.getByLabelText('Note')).toHaveValue('kids at home');
    });
});
