import React from 'react';
import { act, render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';

import LayerRow from './LayerRow';

const COPY_STATUS_MS = 2000;

const layer = { id: 10, projectId: 1, title: 'Learning', position: 0 };

const sequence = (id, layerId, title, position) => ({
    id,
    projectId: 1,
    layerId,
    title,
    description: null,
    isBlocked: false,
    position,
});

const todo = (id, sequenceId, text, status, position) => ({
    id,
    sequenceId,
    text,
    status,
    position,
});

const sequences = [
    sequence(101, 10, 'Electronics', 1),
    sequence(100, 10, 'Aerodynamics', 0),
    sequence(200, 20, 'Rotors', 0),
];

const todos = [
    todo(1, 100, 'Read lift chapter', 'done', 0),
    todo(2, 100, 'Sketch a wing', 'open', 1),
    todo(3, 101, 'Solder the board', 'in_progress', 0),
    todo(4, 200, 'Other layer todo', 'open', 0),
];

const EXPECTED =
    '## Learning\n\n### Aerodynamics\n- Read lift chapter\n- Sketch a wing\n\n### Electronics\n- Solder the board\n';

const graphValue = {
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: { 10: layer },
        sequences: Object.fromEntries(sequences.map((s) => [s.id, s])),
        todos: {},
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
};

const renderRow = () =>
    render(
        <ProjectProvider value={graphValue}>
            <LayerRow layer={layer} sequences={sequences} todos={todos} />
        </ProjectProvider>
    );

const stubClipboard = (clipboard) =>
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

const copyButton = () => screen.getByRole('button', { name: 'Copy layer “Learning” as schema' });

describe('LayerRow copy as schema', () => {
    beforeEach(() => jest.useFakeTimers());

    afterEach(() => {
        jest.useRealTimers();
        stubClipboard(undefined);
    });

    const press = async () => {
        await act(async () => {
            copyButton().click();
        });
    };

    test('writes this layer\'s schema to the clipboard and says Copied', async () => {
        // Arrange
        const writeText = jest.fn().mockResolvedValue(undefined);
        stubClipboard({ writeText });
        renderRow();

        // Act
        await press();

        // Assert
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText).toHaveBeenCalledWith(EXPECTED);
        expect(screen.getByRole('status')).toHaveTextContent('Copied');
    });

    test('clears the message after about two seconds', async () => {
        // Arrange
        stubClipboard({ writeText: jest.fn().mockResolvedValue(undefined) });
        renderRow();
        await press();

        // Act
        act(() => {
            jest.advanceTimersByTime(COPY_STATUS_MS);
        });

        // Assert
        expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    });

    test('says the copy failed when writeText rejects', async () => {
        // Arrange
        stubClipboard({ writeText: jest.fn().mockRejectedValue(new Error('denied')) });
        renderRow();

        // Act
        await press();

        // Assert
        expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
    });

    test('says the copy failed when there is no clipboard', async () => {
        // Arrange
        stubClipboard(undefined);
        renderRow();

        // Act
        await press();

        // Assert
        expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
    });

    test('does not set state after unmount', async () => {
        // Arrange
        stubClipboard({ writeText: jest.fn().mockResolvedValue(undefined) });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = renderRow();
        await press();

        // Act
        unmount();
        act(() => {
            jest.advanceTimersByTime(COPY_STATUS_MS);
        });

        // Assert
        expect(errorSpy).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
        errorSpy.mockRestore();
    });
});
