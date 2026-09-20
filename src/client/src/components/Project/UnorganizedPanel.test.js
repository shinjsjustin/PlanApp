import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ProjectProvider } from '../../state/ProjectContext';
import { click, type } from '../../testUtils/interact';

import { PinSelectionProvider } from './PinSelectionContext';
import UnorganizedPanel from './UnorganizedPanel';

// The floating panel of loose to-dos.
//
// It is a filter over the project's to-dos — those whose `sequenceId` is null —
// and not a collection of its own (spec section 4.2). These tests hold it to
// that: filed to-dos never appear here, and to-dos freed by a deleted sequence
// would show up without the panel being told anything.

const todo = (
    id,
    { sequenceId = null, text = `To-do ${id}`, position = 0, isPinned = false } = {}
) => ({
    id,
    projectId: 1,
    sequenceId,
    text,
    status: 'incomplete',
    isPinned,
    position,
});

const graphValue = (todos) => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: { 10: { id: 10, projectId: 1, title: 'Learning', position: 0 } },
        sequences: {
            100: {
                id: 100,
                projectId: 1,
                layerId: 10,
                title: 'Learn aerodynamics',
                isBlocked: false,
                position: 0,
            },
        },
        todos: Object.fromEntries(todos.map((entry) => [entry.id, entry])),
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const idleSelection = {
    mode: 'idle',
    selectedTodoIds: new Set(),
    isEligible: () => false,
    isSelected: () => false,
    toggle: jest.fn(),
};

const renderPanel = (todos = [], selection = idleSelection) => {
    const value = graphValue(todos);

    const rendered = render(
        <ProjectProvider value={value}>
            <PinSelectionProvider value={selection}>
                <UnorganizedPanel />
            </PinSelectionProvider>
        </ProjectProvider>
    );

    return { ...rendered, value };
};

const toggle = () => screen.getByRole('button', { name: /unorganized/i });

const listedTexts = () =>
    within(screen.getByRole('list', { name: /unorganized to-dos/i }))
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.todo-item-text').textContent);

describe('UnorganizedPanel', () => {
    test('docks to the bottom-right using the page inset', () => {
        const css = readFileSync(join(__dirname, '../Styling/Project.css'), 'utf8');
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        const rule = Array.from(style.sheet.cssRules).find(
            (entry) => entry.selectorText === '.unorganized-panel'
        );
        expect(rule.style.getPropertyValue('position')).toBe('fixed');
        expect(rule.style.getPropertyValue('bottom')).toBe('var(--page-pad)');
        expect(rule.style.getPropertyValue('right')).toBe('var(--page-pad)');
        expect(rule.style.getPropertyValue('left')).toBe('');
        style.remove();
    });

    test('starts collapsed with its list and composer hidden', () => {
        // Act
        renderPanel();

        // Assert
        expect(toggle()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('collapses out of the way when its header is clicked', async () => {
        // Arrange
        renderPanel([todo(1000)]);
        await click(toggle());

        // Act
        await click(toggle());

        // Assert
        expect(toggle()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('list', { name: /unorganized to-dos/i })).not.toBeInTheDocument();
    });

    test('opens when its initially collapsed header is clicked', async () => {
        // Arrange
        renderPanel();

        // Act
        await click(toggle());

        // Assert
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    });

    test('reports the loose count in the initially collapsed pill', () => {
        // Arrange
        renderPanel([todo(1000, { position: 0 }), todo(1001, { position: 1 })]);

        // Assert
        expect(toggle()).toHaveAccessibleName(/unorganized.*2/i);
    });

    test('counts nothing when every to-do is filed', () => {
        // Act
        renderPanel([todo(1001, { sequenceId: 100 })]);

        // Assert
        expect(toggle()).toHaveAccessibleName(/unorganized.*0/i);
    });

    test('lists the loose to-dos in position order', async () => {
        // Arrange + Act — deliberately supplied out of order.
        renderPanel([
            todo(1002, { text: 'Third', position: 2 }),
            todo(1000, { text: 'First', position: 0 }),
            todo(1001, { text: 'Second', position: 1 }),
        ]);

        await click(toggle());

        // Assert
        expect(listedTexts()).toEqual(['First', 'Second', 'Third']);
    });

    test('leaves out the to-dos that are filed in a sequence', async () => {
        // Act
        renderPanel([
            todo(1000, { text: 'Buy propellers' }),
            todo(1001, { sequenceId: 100, text: 'Read about lift' }),
        ]);

        await click(toggle());

        // Assert
        expect(listedTexts()).toEqual(['Buy propellers']);
    });

    test('makes an eligible unorganized row selectable', async () => {
        // Arrange
        const selection = {
            mode: 'pin',
            selectedTodoIds: new Set(),
            isEligible: (entry) => !entry.isPinned,
            isSelected: () => false,
            toggle: jest.fn(),
        };
        renderPanel([todo(1000, { text: 'Buy propellers' })], selection);
        await click(toggle());

        // Act
        await click(screen.getByRole('button', { name: 'Pin “Buy propellers”' }));

        // Assert
        expect(selection.toggle).toHaveBeenCalledWith(1000);
    });

    test('says so when nothing is waiting to be filed', async () => {
        // Act
        renderPanel();
        await click(toggle());

        // Assert
        expect(screen.getByText(/nothing waiting/i)).toBeInTheDocument();
    });

    test('adds a to-do straight into the panel rather than a sequence', async () => {
        // Arrange
        const { value } = renderPanel([todo(1000)]);
        await click(toggle());

        // Act
        await type(
            screen.getByRole('textbox', { name: /unorganized to-do/i }),
            'Buy propellers{enter}'
        );

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'todos',
            expect.objectContaining({
                path: '/projects/1/todos',
                body: { text: 'Buy propellers', sequenceId: null },
            })
        );
    });

    test('takes the composer away with the rest of the body when collapsed', async () => {
        // Arrange
        renderPanel();
        await click(toggle());

        // Act
        await click(toggle());

        // Assert
        expect(
            screen.queryByRole('textbox', { name: /unorganized to-do/i })
        ).not.toBeInTheDocument();
    });
});
