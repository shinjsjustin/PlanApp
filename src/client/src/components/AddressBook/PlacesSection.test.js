import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PlacesSection from './PlacesSection';

const HOME = { id: 1, name: 'Home', address: '1 Main St', kind: 'home', notes: null, visitMinutes: null, isDefaultStart: false };
const SHOP = { id: 2, name: 'Shop', address: '2 Side St', kind: 'supplier', notes: 'ring bell', visitMinutes: 90, isDefaultStart: true };

let hook;

const renderPage = (props = {}) =>
    render(
        <PlacesSection
            places={hook.places}
            startPlaceId={hook.startPlaceId}
            status={hook.status}
            query=""
            onAdd={hook.add}
            onEdit={hook.edit}
            onRemove={hook.remove}
            onSetStart={hook.setStart}
            {...props}
        />
    );
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
});

describe('PlacesSection', () => {
    test('shows a Places heading', () => {
        renderPage();
        expect(screen.getByRole('heading', { name: 'Places' })).toBeInTheDocument();
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

    test('narrows the list by case-insensitive name substring', () => {
        renderPage({ query: ' sHo ' });
        expect(items()).toHaveLength(1);
        expect(screen.getByText('Shop')).toBeInTheDocument();
        expect(screen.queryByText('Home')).not.toBeInTheDocument();
    });
});
