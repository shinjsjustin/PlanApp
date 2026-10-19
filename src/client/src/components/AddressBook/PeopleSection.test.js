import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PeopleSection from './PeopleSection';

const ANN = {
    id: 1,
    name: 'Ann Lee',
    company: 'Acme Co',
    role: 'Buyer',
    emails: ['ann@acme.test'],
    phones: [{ label: 'cell', number: '555-0101' }],
    groups: ['client_contact', 'friend'],
    notes: null,
    place: { id: 4, name: 'Shop', address: '1 Main St' },
    leemacClientId: '77',
    leemacClientName: 'Acme Holdings',
};
const BOB = {
    id: 2,
    name: 'Bob Stone',
    company: null,
    role: null,
    emails: [],
    phones: [],
    groups: ['family'],
    notes: null,
    place: null,
    leemacClientId: null,
    leemacClientName: null,
};

const renderSection = (props = {}) => {
    const handlers = {
        onOpenEdit: jest.fn(),
        onRemove: jest.fn(),
    };
    render(
        <PeopleSection
            people={[ANN, BOB]}
            query=""
            group=""
            status="ready"
            {...handlers}
            {...props}
        />
    );
    return handlers;
};

const itemFor = (name) => screen.getByRole('heading', { name }).closest('li');

describe('PeopleSection', () => {
    it('shows every detail of a person', () => {
        renderSection();
        const item = within(itemFor('Ann Lee'));
        expect(item.getByText('Acme Co')).toBeInTheDocument();
        expect(item.getByText('Buyer')).toBeInTheDocument();
        expect(item.getByText('Client contact')).toBeInTheDocument();
        expect(item.getByText('Friend')).toBeInTheDocument();
        expect(item.getByRole('link', { name: 'ann@acme.test' })).toHaveAttribute('href', 'mailto:ann@acme.test');
        expect(item.getByRole('link', { name: 'cell: 555-0101' })).toHaveAttribute('href', 'tel:555-0101');
        expect(item.getByText('Shop')).toBeInTheDocument();
        expect(item.getByText('Acme Holdings')).toBeInTheDocument();
    });

    it('omits place and client lines when a person has none', () => {
        renderSection();
        expect(within(itemFor('Bob Stone')).queryByText('Shop')).not.toBeInTheDocument();
        expect(within(itemFor('Bob Stone')).getByText('Family')).toBeInTheDocument();
    });

    it('filters by trimmed case-insensitive name or company', () => {
        renderSection({ query: '  ACME ' });
        expect(screen.getByRole('heading', { name: 'Ann Lee' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Bob Stone' })).not.toBeInTheDocument();
    });

    it('filters by group', () => {
        renderSection({ group: 'family' });
        expect(screen.queryByRole('heading', { name: 'Ann Lee' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Bob Stone' })).toBeInTheDocument();
    });

    it('says No people match when the filter excludes everyone', () => {
        renderSection({ query: 'zzz' });
        expect(screen.getByText('No people match')).toBeInTheDocument();
    });

    it('says No people yet when there are no people', () => {
        renderSection({ people: [] });
        expect(screen.getByText('No people yet')).toBeInTheDocument();
    });

    it('shows a loading message while loading', () => {
        renderSection({ status: 'loading' });
        expect(screen.getByText('Loading people…')).toBeInTheDocument();
    });

    it('renders no New person form', () => {
        renderSection();
        expect(screen.queryByText('New person')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    });

    it('calls onOpenEdit with the person when Edit is clicked', async () => {
        const { onOpenEdit } = renderSection();
        await userEvent.click(within(itemFor('Bob Stone')).getByRole('button', { name: 'Edit' }));
        expect(onOpenEdit).toHaveBeenCalledTimes(1);
        expect(onOpenEdit).toHaveBeenCalledWith(BOB);
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    });

    it('removes only after confirming', async () => {
        const { onRemove } = renderSection();
        const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        await userEvent.click(within(itemFor('Ann Lee')).getByRole('button', { name: 'Delete' }));
        expect(confirm).toHaveBeenCalledWith('Delete Ann Lee?');
        expect(onRemove).not.toHaveBeenCalled();
        await userEvent.click(within(itemFor('Ann Lee')).getByRole('button', { name: 'Delete' }));
        expect(onRemove).toHaveBeenCalledWith(1);
        confirm.mockRestore();
    });
});
