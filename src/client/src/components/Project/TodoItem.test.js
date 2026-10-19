import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import TodoItem from './TodoItem';

// One to-do, wherever it is filed.
//
// The status control is a checkbox: a list is read as done or not done, and the
// card around it is built on that reading. `blocked` is still a thing to say
// about a to-do, and it is still said — from the menu, a click deeper, which is
// what lets the common answer be one click.
//
// Leaving a sequence is a menu action, not a drag (spec section 2): dragging a
// to-do back to the panel is explicitly out of scope for v1, so the menu is the
// only way out — and a to-do already in the panel has nowhere to go, so it is
// offered the blocked entry alone.
//
// Deleting is not in that menu. It is the shared hover-reveal × every deletable
// thing in the app now carries, so there is one delete path rather than two.

const filedTodo = {
    id: 1001,
    projectId: 1,
    sequenceId: 100,
    text: 'Read about lift',
    status: 'incomplete',
    position: 0,
};

const looseTodo = {
    id: 1000,
    projectId: 1,
    sequenceId: null,
    text: 'Buy propellers',
    status: 'incomplete',
    position: 0,
};

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
        todos: Object.fromEntries(todos.map((todo) => [todo.id, todo])),
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const renderItem = (todo = filedTodo, siblings = []) => {
    const value = graphValue([todo, ...siblings]);

    const rendered = render(
        <ProjectProvider value={value}>
            <ul>
                <TodoItem todo={todo} />
            </ul>
        </ProjectProvider>
    );

    return { ...rendered, value };
};

const checkbox = () =>
    screen.getByRole('button', { name: /^(complete|mark) “(read about lift|buy propellers)”/i });
const menuToggle = () => screen.getByRole('button', { name: /^actions for/i });
const menuButton = (name) =>
    within(screen.getByRole('list', { name: /^actions menu for/i })).getByRole('button', {
        name,
    });
const deleteBubble = (text = 'Read about lift') =>
    screen.getByRole('button', { name: `Delete “${text}”` });

describe('TodoItem', () => {
    test('shows the to-do text', () => {
        // Act
        renderItem();

        // Assert
        expect(screen.getByText('Read about lift')).toBeInTheDocument();
    });

    // The circle carries no text, so its label is the whole of what a screen
    // reader gets: the state it is in, and what the click will do.
    test('names the current status on the control', () => {
        // Act
        renderItem();

        // Assert
        expect(checkbox()).toHaveAccessibleName(/incomplete/i);
    });

    test('names the way back on a finished to-do', () => {
        // Act
        renderItem({ ...filedTodo, status: 'complete' });

        // Assert
        expect(checkbox()).toHaveAccessibleName(/mark “read about lift” incomplete/i);
    });

    test('says done or not through aria-pressed, not through the tick alone', () => {
        // Act
        renderItem({ ...filedTodo, status: 'complete' });

        // Assert
        expect(checkbox()).toHaveAttribute('aria-pressed', 'true');
    });

    test('carries the status as a class so the list reads at a glance', () => {
        // Act
        const { container } = renderItem({ ...filedTodo, status: 'blocked' });

        // Assert
        expect(container.querySelector('.todo-item--blocked')).toBeInTheDocument();
    });

    test('completes an incomplete to-do', async () => {
        // Arrange
        const { value } = renderItem();

        // Act
        await click(checkbox());

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({ path: '/todos/1001', changes: { status: 'complete' } })
        );
    });

    test('un-completes a finished to-do', async () => {
        // Arrange
        const { value } = renderItem({ ...filedTodo, status: 'complete' });

        // Act
        await click(checkbox());

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({ changes: { status: 'incomplete' } })
        );
    });

    // Being stuck and being finished are different claims, and finishing one
    // wins: a blocked to-do can still be ticked straight off.
    test('completes a blocked to-do', async () => {
        // Arrange
        const { value } = renderItem({ ...filedTodo, status: 'blocked' });

        // Act
        await click(checkbox());

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({ changes: { status: 'complete' } })
        );
    });

    test('marks a to-do blocked from the menu', async () => {
        // Arrange
        const { value } = renderItem();
        await click(menuToggle());

        // Act
        await click(menuButton(/mark blocked/i));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({ changes: { status: 'blocked' } })
        );
    });

    test('clears a block from the menu', async () => {
        // Arrange
        const { value } = renderItem({ ...filedTodo, status: 'blocked' });
        await click(menuToggle());

        // Act
        await click(menuButton(/clear blocked/i));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({ changes: { status: 'incomplete' } })
        );
    });

    // Un-ticking a to-do that was blocked returns it to plain incomplete: the
    // block was cleared when it was finished, and restoring it silently would
    // be a claim nobody made.
    test('does not restore a cleared block when a to-do is un-completed', async () => {
        // Arrange
        const { value } = renderItem({ ...filedTodo, status: 'complete' });

        // Act
        await click(checkbox());

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({ changes: { status: 'incomplete' } })
        );
    });

    test('keeps the menu closed until it is asked for', () => {
        // Act
        renderItem();

        // Assert
        expect(menuToggle()).toHaveAttribute('aria-expanded', 'false');
        expect(
            screen.queryByRole('button', { name: /move to unorganized/i })
        ).not.toBeInTheDocument();
    });

    test('opens the menu', async () => {
        // Arrange
        renderItem();

        // Act
        await click(menuToggle());

        // Assert — blocking and one way out of the sequence, and nothing else:
        // deleting is the × on the row, not a second path buried in here.
        expect(menuToggle()).toHaveAttribute('aria-expanded', 'true');
        const menu = within(screen.getByRole('list', { name: /^actions menu for/i }));
        expect(menu.getByRole('button', { name: /mark blocked/i })).toBeInTheDocument();
        expect(menu.getByRole('button', { name: /move to unorganized/i })).toBeInTheDocument();
        expect(menu.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    test('sends the to-do back to the unorganized panel from the menu', async () => {
        // Arrange — the panel already holds one loose to-do, so this lands after it.
        const { value } = renderItem(filedTodo, [looseTodo]);
        await click(menuToggle());

        // Act
        await click(screen.getByRole('button', { name: /move to unorganized/i }));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({
                path: '/todos/1001/move',
                method: 'put',
                body: { sequenceId: null, position: 1 },
            })
        );
    });

    test('closes the menu once an action is taken', async () => {
        // Arrange
        renderItem(filedTodo, [looseTodo]);
        await click(menuToggle());

        // Act
        await click(screen.getByRole('button', { name: /move to unorganized/i }));

        // Assert
        expect(menuToggle()).toHaveAttribute('aria-expanded', 'false');
    });

    test('offers no way out to a to-do that is already unorganized', async () => {
        // Arrange & Act — it can still be blocked; it just has nowhere to go.
        renderItem(looseTodo);
        await click(menuToggle());

        // Assert
        const menu = within(screen.getByRole('list', { name: /^actions menu for/i }));
        expect(menu.getByRole('button', { name: /mark blocked/i })).toBeInTheDocument();
        expect(
            menu.queryByRole('button', { name: /move to unorganized/i })
        ).not.toBeInTheDocument();
        expect(deleteBubble('Buy propellers')).toBeInTheDocument();
    });

    describe('the delete ×', () => {
        test('names the to-do it would delete', () => {
            // Arrange & Act
            renderItem();

            // Assert
            expect(deleteBubble()).toHaveClass('delete-bubble');
        });

        test('is the row that opts into the shared hover reveal', () => {
            // Arrange & Act
            renderItem();

            // Assert
            expect(deleteBubble().closest('.todo-item')).toHaveClass('has-delete-bubble');
        });

        test('deletes the to-do without opening the menu first', async () => {
            // Arrange
            const { value } = renderItem();

            // Act
            await click(deleteBubble());

            // Assert
            expect(value.removeEntity).toHaveBeenCalledWith(
                'todos',
                1001,
                expect.objectContaining({ path: '/todos/1001' })
            );
        });
    });

    test('closes the menu on Escape without taking any action', async () => {
        // Arrange
        const { value } = renderItem();
        await click(menuToggle());

        // Act
        fireEvent.keyDown(screen.getByRole('list', { name: /^actions menu for/i }), {
            key: 'Escape',
        });

        // Assert
        expect(menuToggle()).toHaveAttribute('aria-expanded', 'false');
        expect(value.removeEntity).not.toHaveBeenCalled();
        expect(value.updateEntity).not.toHaveBeenCalled();
    });
});
