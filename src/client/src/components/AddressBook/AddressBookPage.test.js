import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import AddressBookPage from './AddressBookPage';
import usePeople from '../../hooks/usePeople';
import usePlaces from '../../hooks/usePlaces';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/usePeople');
jest.mock('../../hooks/usePlaces');
jest.mock('../../hooks/useIsPhone');

const person = (id, name, company, groups) => ({
    id, name, company, role: null, emails: [], phones: [], groups, notes: null,
    place: null, leemacClientId: null, leemacClientName: null,
});
const ANN = person(1, 'Ann Lee', 'Acme Co', ['friend']);
const BOB = person(2, 'Bob Stone', null, ['family']);
const HOME = { id: 1, name: 'Home', address: '1 Main St', kind: 'home', notes: null, visitMinutes: null, isDefaultStart: false };
const SHOP = { id: 2, name: 'Shop', address: '2 Side St', kind: 'supplier', notes: null, visitMinutes: null, isDefaultStart: true };

let peopleHook;
let placesHook;

const renderPage = () => render(<AddressBookPage />, { wrapper: MemoryRouter });
const personList = () => document.querySelector('.person-list');
const placeList = () => document.querySelector('.place-list');

beforeEach(() => {
    peopleHook = {
        status: 'ready', people: [ANN, BOB], error: null,
        add: jest.fn().mockResolvedValue(true), edit: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(true), reload: jest.fn(),
    };
    placesHook = {
        status: 'ready', places: [HOME, SHOP], startPlaceId: 2, error: null,
        add: jest.fn().mockResolvedValue(true), edit: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(true), setStart: jest.fn(),
    };
    usePeople.mockImplementation(() => peopleHook);
    usePlaces.mockImplementation(() => placesHook);
    useIsPhone.mockReturnValue(false);
});

describe('AddressBookPage', () => {
    test('shows heading, search, group filter and both sections', () => {
        renderPage();
        expect(screen.getByRole('heading', { name: 'Address Book' })).toBeInTheDocument();
        expect(screen.getByLabelText('Search')).toBeInTheDocument();
        const options = within(screen.getByLabelText('Group')).getAllByRole('option');
        expect(options).toHaveLength(7);
        expect(options[0]).toHaveTextContent('All groups');
        expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Places' })).toBeInTheDocument();
    });

    test('search narrows people by name or company and places by name', async () => {
        renderPage();
        await userEvent.type(screen.getByLabelText('Search'), 'acme');
        expect(within(personList()).getAllByRole('heading', { level: 3 })).toHaveLength(1);
        expect(screen.getByText('Ann Lee')).toBeInTheDocument();
        expect(screen.queryByText('Bob Stone')).not.toBeInTheDocument();
        expect(within(placeList()).queryAllByRole('listitem')).toHaveLength(0);

        await userEvent.clear(screen.getByLabelText('Search'));
        await userEvent.type(screen.getByLabelText('Search'), 'sho');
        expect(within(placeList()).getByText('Shop')).toBeInTheDocument();
        expect(within(placeList()).queryByText('Home')).not.toBeInTheDocument();
    });

    test('group filter narrows people only', async () => {
        renderPage();
        await userEvent.selectOptions(screen.getByLabelText('Group'), 'family');
        expect(screen.getByText('Bob Stone')).toBeInTheDocument();
        expect(screen.queryByText('Ann Lee')).not.toBeInTheDocument();
        expect(within(placeList()).getAllByRole('listitem')).toHaveLength(2);
    });

    test('reloads people after a place edit or delete succeeds, not when it fails', async () => {
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        renderPage();
        const home = within(placeList()).getAllByRole('listitem')[0];

        placesHook.remove.mockResolvedValueOnce(false);
        await userEvent.click(within(home).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(placesHook.remove).toHaveBeenCalledWith(1));
        expect(peopleHook.reload).not.toHaveBeenCalled();

        await userEvent.click(within(home).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(peopleHook.reload).toHaveBeenCalledTimes(1));

        await userEvent.click(within(home).getByRole('button', { name: 'Edit' }));
        await userEvent.click(within(home).getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(placesHook.edit).toHaveBeenCalledWith(1, expect.any(Object)));
        await waitFor(() => expect(peopleHook.reload).toHaveBeenCalledTimes(2));
        window.confirm.mockRestore();
    });

    test('does not reload people when a place edit fails', async () => {
        placesHook.edit.mockResolvedValueOnce(false);
        renderPage();
        const home = within(placeList()).getAllByRole('listitem')[0];
        await userEvent.click(within(home).getByRole('button', { name: 'Edit' }));
        await userEvent.click(within(home).getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(placesHook.edit).toHaveBeenCalled());
        expect(peopleHook.reload).not.toHaveBeenCalled();
    });

    test('shows both hook errors as alerts', () => {
        peopleHook.error = 'People down';
        placesHook.error = 'Places down';
        renderPage();
        const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
        expect(alerts).toEqual(expect.arrayContaining(['People down', 'Places down']));
    });

    test('desktop shows header links; a phone shows none and gets the phone class', () => {
        const { unmount } = renderPage();
        expect(screen.getByRole('link', { name: /projects/i })).toHaveAttribute('href', '/projects');
        expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/calendar');
        expect(screen.getByRole('link', { name: /thoughts/i })).toHaveAttribute('href', '/thoughts');
        unmount();

        useIsPhone.mockReturnValue(true);
        const { container } = renderPage();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(container.firstChild).toHaveClass('address-book-page', 'address-book-page--phone');
    });
});
