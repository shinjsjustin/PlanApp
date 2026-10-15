import React from 'react';
import { act, render, screen } from '@testing-library/react';
import App from './App';
import { api } from './lib/api';

jest.mock('./hooks/useIsPhone', () => ({ __esModule: true, default: () => true }));
jest.mock('./lib/api', () => ({
    api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    ApiError: class ApiError extends Error {},
}));

const base64Url = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '');
const ONE_HOUR_S = 3600;

// Unsigned: jwt-decode only reads the payload.
const unexpiredToken = () =>
    [
        base64Url({ alg: 'none', typ: 'JWT' }),
        base64Url({ access: 1, exp: Math.floor(Date.now() / 1000) + ONE_HOUR_S }),
        'sig',
    ].join('.');

beforeEach(() => {
    localStorage.setItem('token', unexpiredToken());
    api.get.mockResolvedValue([]);
});

afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
});

it.each(['/', '/post-register'])('renders no Projects tab link at %s', (path) => {
    window.history.pushState({}, '', path);
    render(<App />);
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
});

it('mounts the tab bar at /projects with a token', async () => {
    window.history.pushState({}, '', '/projects');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Projects' })).not.toBeNull();
    // Let ProjectsHome's mocked load settle inside act.
    await act(async () => {});
});
