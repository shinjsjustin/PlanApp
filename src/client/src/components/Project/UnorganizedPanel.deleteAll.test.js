import React from 'react';
import { render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import { PinSelectionProvider } from './PinSelectionContext';
import UnorganizedPanel from './UnorganizedPanel';

const todo = (id, sequenceId = null) => ({
    id, projectId: 1, sequenceId, text: `To-do ${id}`, status: 'incomplete', isPinned: false, position: id, note: null,
});

const renderPanel = (todos) => {
    const value = {
        state: {
            project: { id: 1, title: 'Build a drone' },
            layers: {},
            sequences: {},
            todos: Object.fromEntries(todos.map((entry) => [entry.id, entry])),
        },
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
        removeUnorganizedTodos: jest.fn(),
    };
    const selection = {
        mode: 'idle', selectedTodoIds: new Set(), isEligible: () => false, isSelected: () => false, toggle: jest.fn(),
    };

    render(
        <ProjectProvider value={value}>
            <PinSelectionProvider value={selection}>
                <UnorganizedPanel />
            </PinSelectionProvider>
        </ProjectProvider>
    );

    return value;
};

const open = () => click(screen.getByRole('button', { name: /unorganized/i }));
const deleteAll = () => screen.getByRole('button', { name: 'Delete all' });

describe('UnorganizedPanel Delete all', () => {
    test('is absent when the panel holds no loose todo', async () => {
        renderPanel([todo(3, 100)]);
        await open();

        expect(screen.queryByRole('button', { name: 'Delete all' })).not.toBeInTheDocument();
    });

    test('is hidden while the panel is collapsed', () => {
        renderPanel([todo(1)]);

        expect(screen.queryByRole('button', { name: 'Delete all' })).not.toBeInTheDocument();
    });

    test('asks for confirmation naming the count before deleting anything', async () => {
        const value = renderPanel([todo(1), todo(2), todo(3, 100)]);
        await open();

        await click(deleteAll());

        expect(screen.getByRole('dialog', { name: 'Delete all 2 unorganized to-dos?' })).toBeInTheDocument();
        expect(value.removeUnorganizedTodos).not.toHaveBeenCalled();
    });

    test('cancel closes the dialog and deletes nothing', async () => {
        const value = renderPanel([todo(1), todo(2)]);
        await open();
        await click(deleteAll());

        await click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(value.removeUnorganizedTodos).not.toHaveBeenCalled();
    });

    test('confirming deletes once and closes the dialog', async () => {
        const value = renderPanel([todo(1), todo(2)]);
        await open();
        await click(deleteAll());

        await click(screen.getByRole('button', { name: /^Delete all 2/ }));

        expect(value.removeUnorganizedTodos).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
