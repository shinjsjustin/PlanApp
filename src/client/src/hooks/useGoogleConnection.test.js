import { renderHook, act, waitFor } from '@testing-library/react';

import useGoogleConnection from './useGoogleConnection';
import { api } from '../lib/api';

jest.mock('../lib/api');

beforeEach(() => {
    jest.resetAllMocks();
    delete window.location;
    window.location = { assign: jest.fn() };
});

describe('useGoogleConnection', () => {
    it('reports connected and email from GET /google/status', async () => {
        api.get.mockResolvedValue({ connected: true, email: 'j@x.com' });
        const { result } = renderHook(() => useGoogleConnection());

        await waitFor(() => expect(result.current.connected).toBe(true));
        expect(api.get).toHaveBeenCalledWith('/google/status');
        expect(result.current.email).toBe('j@x.com');
        expect(result.current.error).toBeNull();
    });

    it.each([
        ['an array', []],
        ['undefined', undefined],
        ['connected false', { connected: false }],
        ['connected truthy but not true', { connected: 'yes', email: 'a@b.c' }],
    ])('counts %s as not connected', async (_name, answer) => {
        api.get.mockResolvedValue(answer);
        const { result } = renderHook(() => useGoogleConnection());

        await waitFor(() => expect(api.get).toHaveBeenCalled());
        await act(async () => {});
        expect(result.current.connected).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('counts a rejection as not connected and sets an error', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useGoogleConnection());

        await waitFor(() => expect(result.current.error).toBe('down'));
        expect(result.current.connected).toBe(false);
    });

    it('connect posts /google/connect and navigates to the returned url', async () => {
        api.get.mockResolvedValue({ connected: false });
        api.post.mockResolvedValue({ url: 'https://accounts.google.com/x' });
        const { result } = renderHook(() => useGoogleConnection());
        await act(async () => {});

        await act(async () => { await result.current.connect(); });

        expect(api.post).toHaveBeenCalledWith('/google/connect');
        expect(window.location.assign).toHaveBeenCalledWith('https://accounts.google.com/x');
    });

    it('connect sets an error and does not navigate when the post rejects', async () => {
        api.get.mockResolvedValue({ connected: false });
        api.post.mockRejectedValue(new Error('nope'));
        const { result } = renderHook(() => useGoogleConnection());
        await act(async () => {});

        await act(async () => { await result.current.connect(); });

        expect(result.current.error).toBe('nope');
        expect(result.current.isBusy).toBe(false);
        expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('disconnect deletes /google/connection and sets connected false', async () => {
        api.get.mockResolvedValue({ connected: true, email: 'j@x.com' });
        api.delete.mockResolvedValue({});
        const { result } = renderHook(() => useGoogleConnection());
        await waitFor(() => expect(result.current.connected).toBe(true));

        await act(async () => { await result.current.disconnect(); });

        expect(api.delete).toHaveBeenCalledWith('/google/connection');
        expect(result.current.connected).toBe(false);
        expect(result.current.email).toBeNull();
    });

    it('disconnect keeps the connection and sets an error when the delete rejects', async () => {
        api.get.mockResolvedValue({ connected: true, email: 'j@x.com' });
        api.delete.mockRejectedValue(new Error('fail'));
        const { result } = renderHook(() => useGoogleConnection());
        await waitFor(() => expect(result.current.connected).toBe(true));

        await act(async () => { await result.current.disconnect(); });

        expect(result.current.connected).toBe(true);
        expect(result.current.error).toBe('fail');
    });
});
