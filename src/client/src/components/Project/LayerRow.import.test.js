import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click, type } from '../../testUtils/interact';

import LayerRow from './LayerRow';

const layer = { id: 10, projectId: 1, title: 'Learning', position: 0 };

const renderRow = (importSchema = jest.fn().mockResolvedValue({})) => {
    const value = {
        state: {
            project: { id: 1, title: 'Build a drone' },
            layers: { 10: layer },
            sequences: {},
            todos: {},
        },
        importSchema,
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
    };
    render(
        <ProjectProvider value={value}>
            <LayerRow layer={layer} sequences={[]} todos={[]} />
        </ProjectProvider>
    );
    return { value, importSchema };
};

const importVia = async (buttonName, itemName, text = '## A') => {
    fireEvent.contextMenu(screen.getByRole('button', { name: buttonName }), {
        clientX: 5,
        clientY: 5,
    });
    await click(screen.getByRole('menuitem', { name: itemName }));
    await type(screen.getByRole('textbox', { name: 'Schema' }), text);
    await click(screen.getByRole('button', { name: 'Import' }));
};

describe('LayerRow import', () => {
    test('imports a layer after this layer from the divider menu', async () => {
        const { importSchema } = renderRow();

        await importVia('Add a layer below Learning', 'Import layer…');

        expect(importSchema).toHaveBeenCalledTimes(1);
        expect(importSchema).toHaveBeenCalledWith('/projects/1/layers/import', {
            schema: '## A',
            afterLayerId: 10,
        });
    });

    test('imports sequences into this layer from the add-sequence menu', async () => {
        const { importSchema } = renderRow();

        await importVia('Add a sequence to Learning', 'Import sequences…', '### S');

        expect(importSchema).toHaveBeenCalledWith('/layers/10/sequences/import', {
            schema: '### S',
        });
    });

    test('keeps the dialog open with the error when the import is rejected', async () => {
        const { importSchema } = renderRow(jest.fn().mockRejectedValue(new Error('Bad schema')));

        await importVia('Add a layer below Learning', 'Import layer…');

        expect(importSchema).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('alert')).toHaveTextContent('Bad schema');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    test('a plain click on the divider does not open a menu', async () => {
        renderRow();

        await click(screen.getByRole('button', { name: 'Add a layer below Learning' }));

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
