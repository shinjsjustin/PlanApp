import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';

import { api } from '../lib/api';
import { PlaceOptionsProvider, usePlaceOptions } from './usePlaceOptions';

jest.mock('../lib/api', () => ({
    api: { get: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

const PLACES = [
    { id: 1, name: 'Gym' },
    { id: 2, name: 'Library' },
];

describe('usePlaceOptions', () => {
    test('returns null outside a provider', () => {
        const { result } = renderHook(() => usePlaceOptions());

        expect(result.current).toBeNull();
    });

    test('loads places once for many consumers, loading then ready', async () => {
        api.get.mockResolvedValue({ places: PLACES, startPlaceId: 1 });
        const wrapper = ({ children }) => <PlaceOptionsProvider>{children}</PlaceOptionsProvider>;

        const { result } = renderHook(() => [usePlaceOptions(), usePlaceOptions()], { wrapper });

        expect(result.current[0]).toEqual({ places: [], status: 'loading' });
        await waitFor(() => expect(result.current[0].status).toBe('ready'));
        expect(result.current[1].places).toEqual(PLACES);
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith('/places');
    });

    test('reports error with no places when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const wrapper = ({ children }) => <PlaceOptionsProvider>{children}</PlaceOptionsProvider>;

        const { result } = renderHook(() => usePlaceOptions(), { wrapper });

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.places).toEqual([]);
    });
});
