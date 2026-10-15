import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import GoogleConnectButton from './GoogleConnectButton';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const Where = () => {
    const { pathname, search } = useLocation();
    return <div data-testid="where">{pathname + search}</div>;
};

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

    it('finishes ?google=complete once, shows Google connected and clears the params', async () => {
        api.get.mockResolvedValue({ connected: false });
        api.post.mockResolvedValue({ connected: true, email: 'j@x.com' });
        render(
            <React.StrictMode>
                <MemoryRouter initialEntries={['/calendar?google=complete&code=c&state=s']}>
                    <GoogleConnectButton />
                    <Where />
                </MemoryRouter>
            </React.StrictMode>
        );

        expect(await screen.findByRole('status')).toHaveTextContent('Google connected');
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledWith('/google/complete', { code: 'c', state: 's' });
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/calendar'));
        expect(screen.getByTestId('where')).not.toHaveTextContent('code');
        expect(screen.getByTestId('where')).not.toHaveTextContent('google');
        expect(await screen.findByText('Google: j@x.com')).toBeInTheDocument();
    });

    it('shows the failure message when completing rejects', async () => {
        api.get.mockResolvedValue({ connected: false });
        api.post.mockRejectedValue(new Error('bad'));
        renderAt('/calendar?google=complete&code=c&state=s');

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Google sign-in failed. Try again.'
        );
    });

    it('does not post when code or state is missing', async () => {
        api.get.mockResolvedValue({ connected: false });
        renderAt('/calendar?google=complete&code=c');

        await screen.findByRole('button', { name: 'Connect Google' });
        expect(api.post).not.toHaveBeenCalled();
        expect(screen.queryByRole('status')).toBeNull();
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
