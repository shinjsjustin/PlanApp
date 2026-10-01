import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import { PinSelectionProvider } from './PinSelectionContext';
import TodoItem from './TodoItem';

const noteTodo = {
    id: 1001,
    projectId: 1,
    sequenceId: 100,
    text: 'Read about lift',
    status: 'incomplete',
    position: 0,
    note: 'Chapter 3',
};
const bareTodo = { ...noteTodo, note: null };

const graphValue = (todo) => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: {},
        sequences: {},
        todos: { [todo.id]: todo },
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const selection = (mode = 'idle') => ({
    mode,
    selectedTodoIds: new Set(),
    isEligible: () => false,
    isSelected: () => false,
    toggle: jest.fn(),
});

const tree = (todo, { drag = null, mode = 'idle', value = graphValue(todo) } = {}) => (
    <ProjectProvider value={value}>
        <PinSelectionProvider value={selection(mode)}>
            <ul>
                <TodoItem todo={todo} drag={drag} />
            </ul>
        </PinSelectionProvider>
    </ProjectProvider>
);

const dragProps = (isDragging) => ({
    isDragging,
    setNodeRef: jest.fn(),
    style: {},
    handleProps: {},
});

const text = () => screen.getByRole('button', { name: 'Read about lift' });
const noteBox = () => screen.queryByRole('textbox', { name: /^note for/i });
const arrow = () => screen.queryByRole('button', { name: /note for “Read about lift”$/i });

describe('TodoItem note', () => {
    test('keeps the note closed until the text is clicked', () => {
        render(tree(noteTodo));

        expect(noteBox()).not.toBeInTheDocument();
        expect(text()).toHaveAttribute('aria-expanded', 'false');
    });

    test('opens the note on clicking the text and closes it on a second click', async () => {
        render(tree(bareTodo));

        await click(text());
        expect(noteBox()).toBeInTheDocument();
        expect(text()).toHaveAttribute('aria-expanded', 'true');

        await click(text());
        expect(noteBox()).not.toBeInTheDocument();
    });

    test.each(['Enter', ' '])('toggles the note from the keyboard with %p', (key) => {
        render(tree(bareTodo));

        fireEvent.keyDown(text(), { key });

        expect(noteBox()).toBeInTheDocument();
    });

    test('shows a down arrow for a todo with a note and opens it on click', async () => {
        render(tree(noteTodo));
        expect(arrow()).toHaveAccessibleName('Show note for “Read about lift”');
        expect(arrow()).toHaveTextContent('▾');

        await click(arrow());

        expect(noteBox()).toBeInTheDocument();
        expect(arrow()).toHaveAccessibleName('Hide note for “Read about lift”');
        expect(arrow()).toHaveTextContent('▴');
    });

    test('shows no arrow without a note, or with a blank one', () => {
        const { unmount } = render(tree(bareTodo));
        expect(arrow()).not.toBeInTheDocument();
        unmount();

        render(tree({ ...noteTodo, note: '' }));
        expect(arrow()).not.toBeInTheDocument();
    });

    test('does not open from the checkbox, menu toggle, handle or delete x', async () => {
        const value = graphValue(noteTodo);
        render(tree(noteTodo, { drag: dragProps(false), value }));

        await click(screen.getByRole('button', { name: /^complete “/i }));
        await click(screen.getByRole('button', { name: /^actions for/i }));
        await click(screen.getByRole('button', { name: /^drag “/i }));
        await click(screen.getByRole('button', { name: 'Delete “Read about lift”' }));

        expect(noteBox()).not.toBeInTheDocument();
    });

    test('does not open while a pin selection is running', async () => {
        render(tree(bareTodo, { mode: 'pin' }));

        await click(text());

        expect(noteBox()).not.toBeInTheDocument();
    });

    test('closes an open note when a pin selection starts', async () => {
        const value = graphValue(noteTodo);
        const { rerender } = render(tree(noteTodo, { value }));
        await click(text());

        rerender(tree(noteTodo, { value, mode: 'pin' }));

        expect(noteBox()).not.toBeInTheDocument();
    });

    test('closes an open note when a drag starts', async () => {
        const value = graphValue(noteTodo);
        const { rerender } = render(tree(noteTodo, { drag: dragProps(false), value }));
        await click(text());
        expect(noteBox()).toBeInTheDocument();

        rerender(tree(noteTodo, { drag: dragProps(true), value }));

        expect(noteBox()).not.toBeInTheDocument();
    });
});
