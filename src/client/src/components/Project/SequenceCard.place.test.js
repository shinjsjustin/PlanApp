import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../../lib/api';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import { ProjectProvider } from '../../state/ProjectContext';

import { baseSequence, graphValue } from './sequenceCardHarness';
import SequenceCard from './SequenceCard';

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn() },
}));

beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ places: [{ id: 1, name: 'Gym' }], startPlaceId: null });
});

const renderCard = (sequence) => {
    const value = graphValue(sequence, []);

    render(
        <ProjectProvider value={value}>
            <PlaceOptionsProvider>
                <ul>
                    <SequenceCard sequence={sequence} todos={[]} />
                </ul>
            </PlaceOptionsProvider>
        </ProjectProvider>
    );

    return value;
};

describe('SequenceCard place', () => {
    test('choosing No place clears the sequence place', async () => {
        const value = renderCard({ ...baseSequence, placeId: 1 });
        const select = await screen.findByRole('combobox', { name: 'Place' });
        await screen.findByRole('option', { name: 'Gym' });
        expect(select).toHaveValue('1');

        await userEvent.selectOptions(select, 'No place');

        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ path: '/sequences/100', changes: { placeId: null } })
        );
    });

    test('choosing a place does not fold the card', async () => {
        const value = renderCard({ ...baseSequence, placeId: null });
        await screen.findByRole('option', { name: 'Gym' });

        await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Place' }), 'Gym');

        expect(value.updateEntity).toHaveBeenCalledTimes(1);
        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ changes: { placeId: 1 } })
        );
    });

    test('a folded card shows no place select', async () => {
        renderCard({ ...baseSequence, isCollapsed: true });
        await screen.findByText(baseSequence.description);

        expect(screen.queryByLabelText('Place')).not.toBeInTheDocument();
    });
});
