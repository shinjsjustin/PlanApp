import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import PhoneUnorganizedView from './PhoneUnorganizedView';

const todo = (id, text, position, sequenceId = null) => ({
    id, projectId: 1, sequenceId, text, status: 'incomplete', position,
});

const renderView = (todos, onBack = jest.fn()) => {
    const value = {
        state: { project: { id: 1 }, layers: {}, sequences: {}, todos },
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
    };
    render(
        <ProjectProvider value={value}>
            <PhoneUnorganizedView onBack={onBack} />
        </ProjectProvider>
    );
    return { value, onBack };
};

test('lists only unorganized to-dos in position order', () => {
    renderView({
        1: todo(1, 'Second', 1),
        2: todo(2, 'First', 0),
        3: todo(3, 'Filed', 0, 100),
    });
    expect(screen.getByRole('heading', { name: 'Unorganized' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['First', 'Second']);
    expect(screen.queryByText('Filed')).not.toBeInTheDocument();
});

test('shows Nothing unorganized when empty', () => {
    renderView({ 3: todo(3, 'Filed', 0, 100) });
    expect(screen.getByText('Nothing unorganized')).toBeInTheDocument();
});

test('hides Nothing unorganized when there are to-dos', () => {
    renderView({ 1: todo(1, 'One', 0) });
    expect(screen.queryByText('Nothing unorganized')).not.toBeInTheDocument();
});

test('Back calls onBack', () => {
    const { onBack } = renderView({});
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
});

test('the composer adds a to-do with a null sequence', () => {
    const { value } = renderView({});
    fireEvent.change(screen.getByRole('textbox', { name: 'New to-do' }), { target: { value: 'Loose' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(value.createEntity).toHaveBeenCalledWith(
        'todos',
        expect.objectContaining({ body: { text: 'Loose', sequenceId: null } })
    );
});

test('only one editor is open at a time', () => {
    renderView({ 1: todo(1, 'One', 0), 2: todo(2, 'Two', 1) });
    fireEvent.click(screen.getByRole('button', { name: 'Edit “One”' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Two”' }));
    expect(screen.getAllByRole('textbox', { name: 'To-do text' })).toHaveLength(1);
    expect(within(screen.getAllByRole('listitem')[1]).getByRole('textbox', { name: 'To-do text' })).toBeInTheDocument();
});
