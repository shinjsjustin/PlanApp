import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../../lib/api';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import { ProjectProvider } from '../../state/ProjectContext';

import TodoItem from './TodoItem';

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn() },
}));

const todo = {
    id: 1001,
    projectId: 1,
    sequenceId: null,
    text: 'Buy propellers',
    status: 'incomplete',
    position: 0,
    placeId: 2,
};

const renderItem = () => {
    const value = {
        state: {
            project: { id: 1, title: 'Build a drone' },
            layers: {},
            sequences: {},
            todos: { [todo.id]: todo },
        },
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
    };

    render(
        <ProjectProvider value={value}>
            <PlaceOptionsProvider>
                <ul>
                    <TodoItem todo={todo} />
                </ul>
            </PlaceOptionsProvider>
        </ProjectProvider>
    );

    return value;
};

beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
        places: [
            { id: 1, name: 'Gym' },
            { id: 2, name: 'Library' },
        ],
        startPlaceId: null,
    });
});

describe('TodoItem place', () => {
    test('shows no place select while the note panel is closed', async () => {
        renderItem();
        await screen.findByText('Buy propellers');

        expect(screen.queryByLabelText('Place')).not.toBeInTheDocument();
    });

    test('shows the current place in the open note panel', async () => {
        renderItem();

        await userEvent.click(screen.getByText('Buy propellers'));

        const select = await screen.findByLabelText('Place');
        await screen.findByRole('option', { name: 'Library' });
        expect(select).toHaveValue('2');
    });

    test('choosing a place saves it on the to-do', async () => {
        const value = renderItem();
        await userEvent.click(screen.getByText('Buy propellers'));
        const select = await screen.findByRole('combobox', { name: 'Place' });
        await screen.findByRole('option', { name: 'Gym' });

        await userEvent.selectOptions(select, 'Gym');

        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1001,
            expect.objectContaining({ path: '/todos/1001', changes: { placeId: 1 } })
        );
    });
});
