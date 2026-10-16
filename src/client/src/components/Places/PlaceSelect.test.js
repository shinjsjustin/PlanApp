import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../../lib/api';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import PlaceSelect from './PlaceSelect';

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

const PLACES = [
    { id: 1, name: 'Gym' },
    { id: 2, name: 'Library' },
];

const renderSelect = (props) =>
    render(
        <PlaceOptionsProvider>
            <PlaceSelect value={null} onChange={() => {}} {...props} />
        </PlaceOptionsProvider>
    );

describe('PlaceSelect', () => {
    test('renders nothing outside a provider', () => {
        const { container } = render(<PlaceSelect value={null} onChange={() => {}} />);

        expect(container).toBeEmptyDOMElement();
    });

    test('lists No place then each place and shows the current one', async () => {
        api.get.mockResolvedValue({ places: PLACES, startPlaceId: null });

        renderSelect({ value: 2 });

        const select = await screen.findByLabelText('Place');
        await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
            'No place',
            'Gym',
            'Library',
        ]);
        expect(select).toHaveValue('2');
        expect(select).toBeEnabled();
    });

    test('shows No place for a null value', async () => {
        api.get.mockResolvedValue({ places: PLACES, startPlaceId: null });

        renderSelect({ value: null });

        await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
        expect(screen.getByLabelText('Place')).toHaveValue('');
    });

    test('calls onChange with a number, or null for No place', async () => {
        api.get.mockResolvedValue({ places: PLACES, startPlaceId: null });
        const onChange = jest.fn();

        renderSelect({ value: 1, onChange });
        await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));

        await userEvent.selectOptions(screen.getByLabelText('Place'), 'Library');
        expect(onChange).toHaveBeenLastCalledWith(2);

        await userEvent.selectOptions(screen.getByLabelText('Place'), 'No place');
        expect(onChange).toHaveBeenLastCalledWith(null);
    });

    test('shows a disabled Places unavailable select when loading failed', async () => {
        api.get.mockRejectedValue(new Error('down'));

        renderSelect();

        const select = await screen.findByLabelText('Place');
        await waitFor(() => expect(select).toBeDisabled());
        expect(screen.getByRole('option', { name: 'Places unavailable' })).toBeInTheDocument();
    });
});
