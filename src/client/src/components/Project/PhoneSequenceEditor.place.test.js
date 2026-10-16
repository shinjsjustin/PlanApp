import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../../lib/api';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import useProjectMutations from '../../hooks/useProjectMutations';
import PhoneSequenceEditor from './PhoneSequenceEditor';

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn() },
}));
jest.mock('../../hooks/useProjectMutations');

const verbs = {
    renameSequence: jest.fn(),
    updateSequenceDescription: jest.fn(),
    setSequenceBlocked: jest.fn(),
    setSequencePlace: jest.fn(),
};
const sequence = { id: 5, title: 'Frame', description: 'Parts', isBlocked: false, placeId: 1 };

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

const renderEditor = () =>
    render(
        <PlaceOptionsProvider>
            <PhoneSequenceEditor sequence={sequence} onDone={jest.fn()} />
        </PlaceOptionsProvider>
    );

test('shows the current place and choosing one calls setSequencePlace', async () => {
    renderEditor();
    const select = await screen.findByRole('combobox', { name: 'Place' });
    await screen.findByRole('option', { name: 'Library' });
    expect(select).toHaveValue('1');

    await userEvent.selectOptions(select, 'Library');

    expect(verbs.setSequencePlace).toHaveBeenCalledWith(5, 2);
});

test('choosing No place calls setSequencePlace with null', async () => {
    renderEditor();
    await screen.findByRole('option', { name: 'Library' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Place' }), 'No place');

    expect(verbs.setSequencePlace).toHaveBeenCalledWith(5, null);
});
