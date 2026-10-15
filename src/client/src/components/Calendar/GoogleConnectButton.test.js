import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import GoogleConnectButton from './GoogleConnectButton';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const renderAt = (url = '/calendar') =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <GoogleConnectButton />
        </MemoryRouter>
    );

beforeEach(() => {
    jest.resetAllMocks();
    delete window.location;
    window.location = { assign: jest.fn() };
});

describe('GoogleConnectButton', () => {
    it('shows Connect Google when not connected, and connecting navigates', async () => {
        api.get.mockResolvedValue({ connected: false });
        api.post.mockResolvedValue({ url: 'https://g/auth' });
        renderAt();

        await userEvent.click(await screen.findByRole('button', { name: 'Connect Google' }));

        await waitFor(() =>
            expect(window.location.assign).toHaveBeenCalledWith('https://g/auth')
        );
        expect(screen.queryByRole('button', { name: 'Disconnect Google' })).toBeNull();
    });

    it('shows the email and Disconnect Google when connected, and disconnecting flips back', async () => {
        api.get.mockResolvedValue({ connected: true, email: 'j@x.com' });
        api.delete.mockResolvedValue({});
        renderAt();

        expect(await screen.findByText('Google: j@x.com')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Disconnect Google' }));

        expect(await screen.findByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
        expect(api.delete).toHaveBeenCalledWith('/google/connection');
    });

    it('disables the button while a request runs', async () => {
        api.get.mockResolvedValue({ connected: false });
        api.post.mockReturnValue(new Promise(() => {}));
        renderAt();

        await userEvent.click(await screen.findByRole('button', { name: 'Connect Google' }));

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Connect Google' })).toBeDisabled()
        );
    });

    it('shows Google connected in a status element for ?google=connected', async () => {
        api.get.mockResolvedValue({ connected: true, email: 'j@x.com' });
        renderAt('/calendar?google=connected');

        expect(await screen.findByRole('status')).toHaveTextContent('Google connected');
    });

    it('shows the failure message in a status element for ?google=error', async () => {
        api.get.mockResolvedValue({ connected: false });
        renderAt('/calendar?google=error');

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Google sign-in failed. Try again.'
        );
    });

    it('shows no status element without a ?google= result', async () => {
        api.get.mockResolvedValue({ connected: false });
        renderAt();

        await screen.findByRole('button', { name: 'Connect Google' });
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows a request error in an alert', async () => {
        api.get.mockRejectedValue(new Error('down'));
        renderAt();

        expect(await screen.findByRole('alert')).toHaveTextContent('down');
    });
});
