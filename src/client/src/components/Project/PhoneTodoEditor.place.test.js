import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../../lib/api';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import useProjectMutations from '../../hooks/useProjectMutations';
import PhoneTodoEditor from './PhoneTodoEditor';

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn() },
}));
jest.mock('../../hooks/useProjectMutations');

const verbs = {
    renameTodo: jest.fn(),
    setTodoStatus: jest.fn(),
    deleteTodo: jest.fn(),
    updateTodoNote: jest.fn(),
    setTodoPlace: jest.fn(),
};
const todo = { id: 7, text: 'Cut foam', status: 'blocked', note: null, placeId: 2 };

beforeEach(() => {
    jest.clearAllMocks();
    useProjectMutations.mockReturnValue(verbs);
    api.get.mockResolvedValue({
        places: [
            { id: 1, name: 'Gym' },
            { id: 2, name: 'Library' },
        ],
        startPlaceId: null,
    });
});

test('shows the current place and choosing one calls setTodoPlace', async () => {
    render(
        <PlaceOptionsProvider>
            <PhoneTodoEditor todo={todo} onDone={jest.fn()} />
        </PlaceOptionsProvider>
    );
    const select = await screen.findByRole('combobox', { name: 'Place' });
    await screen.findByRole('option', { name: 'Gym' });
    expect(select).toHaveValue('2');

    await userEvent.selectOptions(select, 'Gym');

    expect(verbs.setTodoPlace).toHaveBeenCalledWith(7, 1);
});

test('choosing No place calls setTodoPlace with null', async () => {
    render(
        <PlaceOptionsProvider>
            <PhoneTodoEditor todo={todo} onDone={jest.fn()} />
        </PlaceOptionsProvider>
    );
    await screen.findByRole('option', { name: 'Gym' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Place' }), 'No place');

    expect(verbs.setTodoPlace).toHaveBeenCalledWith(7, null);
});
