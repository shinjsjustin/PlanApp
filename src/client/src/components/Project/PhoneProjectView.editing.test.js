import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import PhoneProjectView from './PhoneProjectView';

const seq = (id, title, position, extra = {}) => ({
    id, projectId: 1, layerId: 10, title, position, isBlocked: false, isCollapsed: false, ...extra,
});

const buildValue = (first = {}) => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: { 10: { id: 10, projectId: 1, title: 'Learning', position: 0 } },
        sequences: {
            100: seq(100, 'Aerodynamics', 0, first),
            101: seq(101, 'Electronics', 1),
        },
        todos: {},
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const renderView = (first) => {
    const value = buildValue(first);
    render(
        <ProjectProvider value={value}>
            <PhoneProjectView />
        </ProjectProvider>
    );
    return value;
};

const swipeLeft = () => {
    const box = document.querySelector('.phone-sequence');
    fireEvent.touchStart(box, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(box, { changedTouches: [{ clientX: 100, clientY: 100 }] });
};

beforeEach(() => localStorage.clear());

test('read view shows the description and Blocked badge when set', () => {
    renderView({ description: 'Wing shapes', isBlocked: true });
    expect(screen.getByText('Wing shapes')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
});

test('read view omits description and badge when unset', () => {
    renderView();
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
    expect(document.querySelector('.phone-sequence-description')).toBeNull();
});

test('Edit sequence opens the editor in place of the title block and Done closes it', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Edit sequence' }));
    expect(screen.getByRole('textbox', { name: 'Sequence title' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Aerodynamics' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('textbox', { name: 'Sequence title' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aerodynamics' })).toBeInTheDocument();
});

test('swiping is ignored while editing and works again after Done', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Edit sequence' }));
    swipeLeft();
    expect(screen.getByRole('textbox', { name: 'Sequence title' })).toHaveValue('Aerodynamics');
    expect(localStorage.getItem('planapp:lastSequence:1')).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    swipeLeft();
    expect(screen.getByRole('heading', { name: 'Electronics' })).toBeInTheDocument();
});

test('Blocked toggle in the editor updates the sequence', () => {
    const value = renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Edit sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blocked' }));
    expect(value.updateEntity).toHaveBeenCalledWith('sequences', 100, {
        path: '/sequences/100',
        changes: { isBlocked: true },
    });
});

const todo = (id, status = 'incomplete') => ({
    id, projectId: 1, sequenceId: 100, text: `Todo ${id}`, status, position: id, isPinned: false,
});

const renderWithTodos = () => {
    const value = buildValue();
    value.state.todos = { 1: todo(1), 2: todo(2) };
    render(
        <ProjectProvider value={value}>
            <PhoneProjectView />
        </ProjectProvider>
    );
    return value;
};

test('Edit button opens the editor under that row and toggles it closed', () => {
    renderWithTodos();
    const edit = screen.getByRole('button', { name: 'Edit “Todo 1”' });
    fireEvent.click(edit);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toContainElement(screen.getByRole('textbox', { name: 'To-do text' }));
    expect(screen.getByRole('textbox', { name: 'To-do text' })).toHaveValue('Todo 1');
    fireEvent.click(edit);
    expect(screen.queryByRole('textbox', { name: 'To-do text' })).not.toBeInTheDocument();
});

test('only one to-do editor is open at a time', () => {
    renderWithTodos();
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Todo 1”' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Todo 2”' }));
    const fields = screen.getAllByRole('textbox', { name: 'To-do text' });
    expect(fields).toHaveLength(1);
    expect(fields[0]).toHaveValue('Todo 2');
});

test('the tick still works while a row is being edited', () => {
    const value = renderWithTodos();
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Todo 1”' }));
    fireEvent.click(screen.getByRole('button', { name: /^Complete “Todo 2”/ }));
    expect(value.updateEntity).toHaveBeenCalledWith('todos', 2, {
        path: '/todos/2',
        changes: { status: 'complete' },
    });
});

test('swiping is ignored while a to-do editor is open and works after Done', () => {
    renderWithTodos();
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Todo 1”' }));
    swipeLeft();
    expect(screen.getByRole('heading', { name: 'Aerodynamics' })).toBeInTheDocument();
    expect(localStorage.getItem('planapp:lastSequence:1')).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    swipeLeft();
    expect(screen.getByRole('heading', { name: 'Electronics' })).toBeInTheDocument();
});

test('Delete in the editor removes the to-do without confirmation', () => {
    const value = renderWithTodos();
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Todo 1”' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(value.removeEntity).toHaveBeenCalledWith('todos', 1, expect.objectContaining({ path: '/todos/1' }));
});
