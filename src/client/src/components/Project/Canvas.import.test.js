import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click, type } from '../../testUtils/interact';

import Canvas from './Canvas';

const renderCanvas = (importSchema) => {
    const value = {
        state: { project: { id: 1, title: 'Build a drone' }, layers: {}, sequences: {}, todos: {} },
        importSchema,
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
    };
    render(
        <ProjectProvider value={value}>
            <Canvas />
        </ProjectProvider>
    );
};

const openImport = async () => {
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Add the first layer' }), {
        clientX: 5,
        clientY: 5,
    });
    await click(screen.getByRole('menuitem', { name: 'Import layer…' }));
    await type(screen.getByRole('textbox', { name: 'Schema' }), '## First');
    await click(screen.getByRole('button', { name: 'Import' }));
};

describe('Canvas import', () => {
    test('imports the first layer without afterLayerId', async () => {
        const importSchema = jest.fn().mockResolvedValue({});
        renderCanvas(importSchema);

        await openImport();

        expect(importSchema).toHaveBeenCalledTimes(1);
        expect(importSchema).toHaveBeenCalledWith('/projects/1/layers/import', {
            schema: '## First',
        });
    });

    test('keeps the dialog open with the error when the import is rejected', async () => {
        renderCanvas(jest.fn().mockRejectedValue(new Error('Nope')));

        await openImport();

        expect(screen.getByRole('alert')).toHaveTextContent('Nope');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
