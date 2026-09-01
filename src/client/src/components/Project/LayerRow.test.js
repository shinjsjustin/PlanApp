import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import LayerRow from './LayerRow';

// The context is provided with spies in place of the three graph helpers, so
// everything from the button down — the verbs in `useProjectMutations`, the
// cascades they carry — is the real code, and only the network boundary is
// stubbed. The assertions are on the request each button would send.

const SAVE_DELAY = 400;

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

const graphValue = (sequences) => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: { 10: layer, 20: { id: 20, projectId: 1, title: 'Design', position: 1 } },
        sequences: Object.fromEntries(sequences.map((s) => [s.id, s])),
        todos: {},
        edges: {},
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const renderRow = (sequences = [], todos = []) => {
    const value = graphValue(sequences);

    const rendered = render(
        <ProjectProvider value={value}>
            <LayerRow layer={layer} sequences={sequences} todos={todos} />
        </ProjectProvider>
    );

    return { ...rendered, value };
};

describe('LayerRow', () => {
    test('shows the layer title in an editable field', () => {
        // Act
        renderRow();

        // Assert
        expect(screen.getByRole('textbox', { name: /layer title/i })).toHaveValue('Learning');
    });

    test('renders the layer\'s sequences left to right by position', () => {
        // Arrange
        const sequences = [
            sequence(102, 10, 'Learn network comms', 2),
            sequence(100, 10, 'Learn aerodynamics', 0),
            sequence(101, 10, 'Learn electronics', 1),
        ];

        // Act
        renderRow(sequences);

        // Assert
        const titles = screen
            .getAllByRole('textbox', { name: /sequence title/i })
            .map((field) => field.value);
        expect(titles).toEqual(['Learn aerodynamics', 'Learn electronics', 'Learn network comms']);
    });

    test('ignores sequences belonging to another layer', () => {
        // Arrange — the whole project's sequences are passed in.
        const sequences = [
            sequence(100, 10, 'Learn aerodynamics', 0),
            sequence(200, 20, 'Design rotor system', 0),
        ];

        // Act
        renderRow(sequences);

        // Assert
        expect(screen.getByDisplayValue('Learn aerodynamics')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('Design rotor system')).not.toBeInTheDocument();
    });

    test('says so when the layer holds no sequences', () => {
        // Act
        renderRow();

        // Assert
        expect(screen.getByText(/no sequences/i)).toBeInTheDocument();
    });

    test('adds a sequence to this layer from the gutter button', async () => {
        // Arrange
        const { value } = renderRow([sequence(100, 10, 'Learn aerodynamics', 0)]);

        // Act
        await click(screen.getByRole('button', { name: /add a sequence/i }));

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'sequences',
            expect.objectContaining({ path: '/layers/10/sequences' })
        );
    });

    test('adds a layer directly below this one from the gutter button', async () => {
        // Arrange
        const { value } = renderRow();

        // Act
        await click(screen.getByRole('button', { name: /add a layer below/i }));

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'layers',
            expect.objectContaining({ path: '/projects/1/layers', body: { afterLayerId: 10 } })
        );
    });

    test('patches the layer when its title is edited and committed', () => {
        // Arrange
        jest.useFakeTimers();
        try {
            const { value } = renderRow();
            const field = screen.getByRole('textbox', { name: /layer title/i });

            // Act
            fireEvent.change(field, { target: { value: 'Foundations' } });
            fireEvent.keyDown(field, { key: 'Enter' });
            act(() => jest.advanceTimersByTime(SAVE_DELAY));

            // Assert
            expect(value.updateEntity).toHaveBeenCalledWith(
                'layers',
                10,
                expect.objectContaining({ path: '/layers/10', changes: { title: 'Foundations' } })
            );
        } finally {
            jest.useRealTimers();
        }
    });

    test('asks before deleting a layer that holds work, and says where it goes', async () => {
        // Arrange
        const { value } = renderRow([sequence(100, 10, 'Learn aerodynamics', 0)]);

        // Act
        await click(screen.getByRole('button', { name: /delete layer/i }));

        // Assert
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent(/not deleted/i);
        expect(dialog).toHaveTextContent(/unorganized panel/i);
        expect(value.removeEntity).not.toHaveBeenCalled();
    });

    test('deletes the layer once the confirmation is accepted', async () => {
        // Arrange
        const { value } = renderRow([sequence(100, 10, 'Learn aerodynamics', 0)]);
        await click(screen.getByRole('button', { name: /delete layer/i }));

        // Act
        await click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));

        // Assert
        expect(value.removeEntity).toHaveBeenCalledWith(
            'layers',
            10,
            expect.objectContaining({ path: '/layers/10' })
        );
    });

    test('leaves the layer alone when the confirmation is cancelled', async () => {
        // Arrange
        const { value } = renderRow([sequence(100, 10, 'Learn aerodynamics', 0)]);
        await click(screen.getByRole('button', { name: /delete layer/i }));

        // Act
        await click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

        // Assert
        expect(value.removeEntity).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('deletes an empty layer without asking, since nothing is orphaned', async () => {
        // Arrange
        const { value } = renderRow();

        // Act
        await click(screen.getByRole('button', { name: /delete layer/i }));

        // Assert
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(value.removeEntity).toHaveBeenCalledWith(
            'layers',
            10,
            expect.objectContaining({ path: '/layers/10' })
        );
    });

    test('deletes through the same hover-reveal × as everything else', () => {
        // Arrange & Act
        renderRow();

        // Assert — the shared affordance, named with its kind: the sequences
        // inside this row carry one of their own.
        const bubble = screen.getByRole('button', { name: 'Delete layer “Learning”' });

        expect(bubble).toHaveClass('delete-bubble');
        expect(bubble.closest('.layer-row')).toHaveClass('has-delete-bubble');
        expect(screen.queryByRole('button', { name: /^delete layer$/i })).not.toBeInTheDocument();
    });

    test('keeps a permanent gutter column beside the row for the buttons', () => {
        // Arrange — phase 7 routes skip-edges down this column, so it is a real
        // reserved column whether or not anything is in it.
        const { container } = renderRow();

        // Assert
        expect(container.querySelectorAll('.canvas-gutter')).toHaveLength(2);
    });
});
