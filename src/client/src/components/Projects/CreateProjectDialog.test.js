import React from 'react';
import { render, screen } from '@testing-library/react';

import { clear, click, type } from '../../testUtils/interact';

import CreateProjectDialog from './CreateProjectDialog';

const renderDialog = (props = {}) => {
    const onCreate = props.onCreate ?? jest.fn().mockResolvedValue(undefined);
    const onCancel = props.onCancel ?? jest.fn();

    render(<CreateProjectDialog onCreate={onCreate} onCancel={onCancel} />);

    return { onCreate, onCancel };
};

describe('CreateProjectDialog', () => {
    test('submits the trimmed title and description', async () => {
        // Arrange
        const { onCreate } = renderDialog();

        // Act
        await type(screen.getByLabelText(/title/i), '  Build a drone  ');
        await type(screen.getByLabelText(/description/i), ' Layered plan ');
        await click(screen.getByRole('button', { name: /^create project$/i }));

        // Assert
        expect(onCreate).toHaveBeenCalledWith({
            title: 'Build a drone',
            description: 'Layered plan',
        });
    });

    test('rejects a blank title inline without calling the API', async () => {
        // Arrange
        const { onCreate } = renderDialog();

        // Act
        await type(screen.getByLabelText(/title/i), '   ');
        await click(screen.getByRole('button', { name: /^create project$/i }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(/title/i);
        expect(onCreate).not.toHaveBeenCalled();
    });

    test('surfaces a failed creation and stays open', async () => {
        // Arrange
        const onCreate = jest.fn().mockRejectedValue(new Error('Something went wrong.'));
        renderDialog({ onCreate });

        // Act
        await type(screen.getByLabelText(/title/i), 'Doomed');
        await click(screen.getByRole('button', { name: /^create project$/i }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
        expect(screen.getByLabelText(/title/i)).toHaveValue('Doomed');
    });

    test('cancels without creating anything', async () => {
        // Arrange
        const { onCreate, onCancel } = renderDialog();

        // Act
        await click(screen.getByRole('button', { name: /cancel/i }));

        // Assert
        expect(onCancel).toHaveBeenCalled();
        expect(onCreate).not.toHaveBeenCalled();
    });
});
