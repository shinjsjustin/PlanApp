import React from 'react';
import { render, screen, within } from '@testing-library/react';
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
            onOpenEdit={hook.openEdit}
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
        openEdit: jest.fn(),
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

    test('Edit calls onOpenEdit with the place instead of opening an inline form', async () => {
        renderPage();
        await userEvent.click(within(items()[1]).getByRole('button', { name: 'Edit' }));
        expect(hook.openEdit).toHaveBeenCalledTimes(1);
        expect(hook.openEdit).toHaveBeenCalledWith(SHOP);
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    });

    test('renders no New place form', () => {
        renderPage();
        expect(screen.queryByText('New place')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add place' })).not.toBeInTheDocument();
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
