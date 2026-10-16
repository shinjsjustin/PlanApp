import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import PlacesPage from './PlacesPage';
import usePlaces from '../../hooks/usePlaces';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/usePlaces');
jest.mock('../../hooks/useIsPhone');

const HOME = { id: 1, name: 'Home', address: '1 Main St', kind: 'home', notes: null, visitMinutes: null, isDefaultStart: false };
const SHOP = { id: 2, name: 'Shop', address: '2 Side St', kind: 'supplier', notes: 'ring bell', visitMinutes: 90, isDefaultStart: true };

let hook;

const renderPage = () => render(<PlacesPage />, { wrapper: MemoryRouter });
const items = () => screen.getAllByRole('listitem');

beforeEach(() => {
    hook = {
        status: 'ready',
        places: [HOME, SHOP],
        startPlaceId: 2,
        error: null,
        add: jest.fn().mockResolvedValue(true),
        edit: jest.fn().mockResolvedValue(true),
        remove: jest.fn(),
        setStart: jest.fn(),
    };
    usePlaces.mockImplementation(() => hook);
    useIsPhone.mockReturnValue(false);
});

describe('PlacesPage', () => {
    test('shows heading and header links on desktop, no links on a phone', () => {
        const { unmount } = renderPage();
        expect(screen.getByRole('heading', { name: 'Places' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /projects/i })).toHaveAttribute('href', '/projects');
        expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/calendar');
        expect(screen.getByRole('link', { name: /thoughts/i })).toHaveAttribute('href', '/thoughts');
        unmount();

        useIsPhone.mockReturnValue(true);
        const { container } = renderPage();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(container.firstChild).toHaveClass('places-page--phone');
    });

    test('lists places with kind, address and visit length', () => {
        renderPage();
        const [home, shop] = items();
        expect(within(home).getByText('Home')).toBeInTheDocument();
        expect(within(home).getByText('1 Main St')).toBeInTheDocument();
        expect(within(home).getByText('home')).toBeInTheDocument();
        expect(within(home).queryByText(/visit/i)).not.toBeInTheDocument();
        expect(within(shop).getByText('supplier')).toBeInTheDocument();
        expect(within(shop).getByText('2 Side St')).toBeInTheDocument();
        expect(within(shop).getByText('1 h 30 min')).toBeInTheDocument();
    });

    test('badges only the starting place and offers Make starting place on the others', async () => {
        renderPage();
        const [home, shop] = items();
        expect(within(shop).getByText('Starting place')).toBeInTheDocument();
        expect(within(home).queryByText('Starting place')).not.toBeInTheDocument();
        expect(within(shop).queryByRole('button', { name: 'Make starting place' })).not.toBeInTheDocument();

        await userEvent.click(within(home).getByRole('button', { name: 'Make starting place' }));
        expect(hook.setStart).toHaveBeenCalledWith(1);
    });

    test('Delete confirms and calls remove only when accepted', async () => {
        const confirm = jest.spyOn(window, 'confirm');
        renderPage();
        const [home] = items();

        confirm.mockReturnValue(false);
        await userEvent.click(within(home).getByRole('button', { name: 'Delete' }));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(hook.remove).not.toHaveBeenCalled();

        confirm.mockReturnValue(true);
        await userEvent.click(within(home).getByRole('button', { name: 'Delete' }));
        expect(hook.remove).toHaveBeenCalledWith(1);
        confirm.mockRestore();
    });

    test('Edit opens a prefilled form whose Save calls edit with the id and fields', async () => {
        renderPage();
        const shop = items()[1];
        await userEvent.click(within(shop).getByRole('button', { name: 'Edit' }));
        const name = within(shop).getByLabelText('Name');
        expect(name).toHaveValue('Shop');
        await userEvent.clear(name);
        await userEvent.type(name, 'Big Shop');
        await userEvent.click(within(shop).getByRole('button', { name: 'Save' }));

        expect(hook.edit).toHaveBeenCalledWith(2, {
            name: 'Big Shop',
            address: '2 Side St',
            kind: 'supplier',
            notes: 'ring bell',
            visitMinutes: 90,
        });
        await waitFor(() => expect(within(shop).queryByLabelText('Name')).not.toBeInTheDocument());
    });

    test('keeps the edit form open when edit resolves false, and Cancel closes it', async () => {
        hook.edit.mockResolvedValueOnce(false);
        renderPage();
        const shop = items()[1];
        await userEvent.click(within(shop).getByRole('button', { name: 'Edit' }));
        await userEvent.click(within(shop).getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(within(shop).getByRole('button', { name: 'Save' })).toBeEnabled());
        expect(within(shop).getByLabelText('Name')).toBeInTheDocument();

        await userEvent.click(within(shop).getByRole('button', { name: 'Cancel' }));
        expect(within(shop).queryByLabelText('Name')).not.toBeInTheDocument();
    });

    test('the New place form calls add with the fields', async () => {
        renderPage();
        const section = screen.getByRole('region', { name: 'New place' });
        await userEvent.type(within(section).getByLabelText('Name'), 'Church');
        await userEvent.type(within(section).getByLabelText('Address'), '3 Elm St');
        await userEvent.selectOptions(within(section).getByLabelText('Kind'), 'church');
        await userEvent.click(within(section).getByRole('button', { name: 'Add place' }));

        expect(hook.add).toHaveBeenCalledWith({
            name: 'Church',
            address: '3 Elm St',
            kind: 'church',
            notes: null,
            visitMinutes: null,
        });
        await waitFor(() => expect(within(section).getByLabelText('Name')).toHaveValue(''));
        await waitFor(() => expect(within(section).getByRole('button', { name: 'Add place' })).toBeDisabled());
    });

    test('shows a loading state instead of the list', () => {
        hook.status = 'loading';
        hook.places = [];
        renderPage();
        expect(screen.getByText('Loading places…')).toBeInTheDocument();
        expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    test('shows the hook error in an alert', () => {
        hook.error = 'Could not reach the server';
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    });
});
