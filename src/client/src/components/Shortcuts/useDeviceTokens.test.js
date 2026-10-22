import { renderHook, act, waitFor } from '@testing-library/react';

import useDeviceTokens from './useDeviceTokens';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const PHONE = { id: 1, name: 'Phone', lastUsedAt: '2026-10-20T10:00:00.000Z', createdAt: '2026-10-01T10:00:00.000Z' };
const IPAD = { id: 2, name: 'iPad', lastUsedAt: null, createdAt: '2026-10-02T10:00:00.000Z' };

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useDeviceTokens', () => {
    test('lists tokens from /device-tokens', async () => {
        api.get.mockResolvedValue([PHONE, IPAD]);
        const { result } = renderHook(() => useDeviceTokens());
        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith('/device-tokens');
        expect(result.current.tokens).toEqual([PHONE, IPAD]);
    });

    test('create posts the name, returns the one-time token and reloads the list', async () => {
        api.get.mockResolvedValueOnce([PHONE]).mockResolvedValueOnce([PHONE, IPAD]);
        api.post.mockResolvedValue({ id: 2, name: 'iPad', token: 'secret-abc', createdAt: IPAD.createdAt });
        const { result } = renderHook(() => useDeviceTokens());
        await waitFor(() => expect(result.current.status).toBe('ready'));

        let token;
        await act(async () => {
            token = await result.current.create('iPad');
        });

        expect(api.post).toHaveBeenCalledWith('/device-tokens', { name: 'iPad' });
        expect(token).toBe('secret-abc');
        expect(result.current.tokens).toEqual([PHONE, IPAD]);
    });

    test('create returns null and sets error when the call fails', async () => {
        api.get.mockResolvedValue([PHONE]);
        api.post.mockRejectedValue(new Error('name is required'));
        const { result } = renderHook(() => useDeviceTokens());
        await waitFor(() => expect(result.current.status).toBe('ready'));

        let token;
        await act(async () => {
            token = await result.current.create('');
        });

        expect(token).toBeNull();
        expect(result.current.error).toBe('name is required');
        expect(result.current.tokens).toEqual([PHONE]);
    });

    test('revoke deletes by id and reloads the list', async () => {
        api.get.mockResolvedValueOnce([PHONE, IPAD]).mockResolvedValueOnce([IPAD]);
        api.delete.mockResolvedValue({ id: 1 });
        const { result } = renderHook(() => useDeviceTokens());
        await waitFor(() => expect(result.current.status).toBe('ready'));

        let didRevoke;
        await act(async () => {
            didRevoke = await result.current.revoke(1);
        });

        expect(api.delete).toHaveBeenCalledWith('/device-tokens/1');
        expect(didRevoke).toBe(true);
        expect(result.current.tokens).toEqual([IPAD]);
    });

    test('revoke failure keeps the list and sets error', async () => {
        api.get.mockResolvedValue([PHONE]);
        api.delete.mockRejectedValue(new Error('Device token not found'));
        const { result } = renderHook(() => useDeviceTokens());
        await waitFor(() => expect(result.current.status).toBe('ready'));

        let didRevoke;
        await act(async () => {
            didRevoke = await result.current.revoke(1);
        });

        expect(didRevoke).toBe(false);
        expect(result.current.error).toBe('Device token not found');
        expect(result.current.tokens).toEqual([PHONE]);
    });

    test('a failed load sets status error with the message', async () => {
        api.get.mockRejectedValue(new Error('Could not reach the server.'));
        const { result } = renderHook(() => useDeviceTokens());
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('Could not reach the server.');
    });
});
