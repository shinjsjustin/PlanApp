import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import ShortcutsPage from './ShortcutsPage';
import useDeviceTokens from './useDeviceTokens';
import usePlaces from '../../hooks/usePlaces';

jest.mock('./useDeviceTokens');
jest.mock('../../hooks/usePlaces');

const PHONE = { id: 1, name: 'Phone', lastUsedAt: '2026-10-20T10:00:00.000Z', createdAt: '2026-10-01T10:00:00.000Z' };
const IPAD = { id: 2, name: 'iPad', lastUsedAt: null, createdAt: '2026-10-02T10:00:00.000Z' };
const HOME = { id: 7, name: 'Home', address: '1 Main St' };
const SHOP = { id: 9, name: 'Shop', address: '2 Side St' };

let tokensHook;
let placesHook;
const originalUrl = process.env.REACT_APP_URL;

beforeEach(() => {
    process.env.REACT_APP_URL = 'https://plan.example.com/api';
    tokensHook = {
        status: 'ready', tokens: [PHONE, IPAD], error: null,
        create: jest.fn().mockResolvedValue('secret-abc'),
        revoke: jest.fn().mockResolvedValue(true),
    };
    placesHook = { status: 'ready', places: [HOME, SHOP], startPlaceId: null, error: null };
    useDeviceTokens.mockImplementation(() => tokensHook);
    usePlaces.mockImplementation(() => placesHook);
    window.confirm = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: jest.fn().mockResolvedValue() },
        configurable: true,
    });
});

afterEach(() => {
    process.env.REACT_APP_URL = originalUrl;
});

describe('ShortcutsPage', () => {
    test('lists each device token with its name and last used', () => {
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        const phone = screen.getByText('Phone').closest('li');
        expect(within(phone).getByText(/Last used/)).toBeInTheDocument();
        expect(within(phone).queryByText(/Never used/)).toBeNull();
        const ipad = screen.getByText('iPad').closest('li');
        expect(within(ipad).getByText(/Never used/)).toBeInTheDocument();
    });

    test('creates a token from a name and shows the token once with a copy button', async () => {
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        await userEvent.type(screen.getByLabelText(/device name/i), 'Work phone');
        await userEvent.click(screen.getByRole('button', { name: /create token/i }));

        expect(tokensHook.create).toHaveBeenCalledWith('Work phone');
        expect(await screen.findByText('secret-abc')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /copy/i }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-abc');
    });

    test('does not show a token when create fails', async () => {
        tokensHook.create.mockResolvedValue(null);
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        await userEvent.type(screen.getByLabelText(/device name/i), 'Work phone');
        await userEvent.click(screen.getByRole('button', { name: /create token/i }));
        expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    });

    test('revokes a token after confirm', async () => {
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        const phone = screen.getByText('Phone').closest('li');
        await userEvent.click(within(phone).getByRole('button', { name: /revoke/i }));
        expect(window.confirm).toHaveBeenCalled();
        expect(tokensHook.revoke).toHaveBeenCalledWith(1);
    });

    test('does not revoke when the confirm is declined', async () => {
        window.confirm.mockReturnValue(false);
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        const phone = screen.getByText('Phone').closest('li');
        await userEvent.click(within(phone).getByRole('button', { name: /revoke/i }));
        expect(tokensHook.revoke).not.toHaveBeenCalled();
    });

    test('picking a place shows its arrive and leave URLs', async () => {
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        expect(screen.queryByText(/place-events/)).toBeNull();
        userEvent.selectOptions(screen.getByLabelText(/place/i), '9');
        expect(screen.getByText('https://plan.example.com/api/place-events/9/arrive')).toBeInTheDocument();
        expect(screen.getByText('https://plan.example.com/api/place-events/9/leave')).toBeInTheDocument();
    });

    test('numbered steps cover the automation, Get Contents of URL, POST and Bearer header', () => {
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        const steps = screen.getByRole('list', { name: /steps/i });
        expect(steps.tagName).toBe('OL');
        const text = steps.textContent;
        expect(text).toMatch(/Arrive/);
        expect(text).toMatch(/Leave/);
        expect(text).toMatch(/Get Contents of URL/);
        expect(text).toMatch(/POST/);
        expect(text).toMatch(/Authorization/);
        expect(text).toMatch(/Bearer/);
    });

    test('shows API errors in an alert', () => {
        tokensHook = { ...tokensHook, error: 'Could not reach the server.' };
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    });

    test('shows place errors in an alert', () => {
        placesHook = { ...placesHook, error: 'Places broke' };
        render(<ShortcutsPage />, { wrapper: MemoryRouter });
        expect(screen.getByRole('alert')).toHaveTextContent('Places broke');
    });
});
