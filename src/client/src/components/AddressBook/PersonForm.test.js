import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PersonForm from './PersonForm';

const PLACES = [
    { id: 4, name: 'Shop' },
    { id: 7, name: 'Church hall' },
];

const renderForm = (props = {}) => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<PersonForm submitLabel="Add person" places={PLACES} onSubmit={onSubmit} {...props} />);
    return onSubmit;
};

const submitButton = () => screen.getByRole('button', { name: 'Add person' });
const settle = () => waitFor(() => expect(submitButton()).toBeEnabled());

const BLANK_PAYLOAD = {
    name: 'Ann',
    company: null,
    role: null,
    emails: [],
    phones: [],
    groups: [],
    notes: null,
    placeId: null,
    leemacClientId: null,
    leemacClientName: null,
};

describe('PersonForm', () => {
    test('has every labelled field', () => {
        renderForm();
        ['Name', 'Company', 'Role', 'Notes', 'Place', 'Leemac client id', 'Leemac client name'].forEach((label) =>
            expect(screen.getByLabelText(label)).toBeInTheDocument()
        );
        ['Family', 'Friend', 'Client contact', 'Supplier', 'Church', 'Other'].forEach((label) =>
            expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked()
        );
        expect(screen.getByRole('button', { name: 'Add email' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add phone' })).toBeInTheDocument();
    });

    test('Place offers No place then each place by name', () => {
        renderForm();
        const options = within(screen.getByLabelText('Place')).getAllByRole('option');
        expect(options.map((o) => o.textContent)).toEqual(['No place', 'Shop', 'Church hall']);
        expect(options.map((o) => o.value)).toEqual(['', '4', '7']);
    });

    test('phone labels suggest office, cell and home', async () => {
        renderForm();
        await userEvent.click(screen.getByRole('button', { name: 'Add phone' }));
        const listId = screen.getByLabelText('Phone label 1').getAttribute('list');
        const values = Array.from(document.getElementById(listId).querySelectorAll('option')).map((o) => o.value);
        expect(values).toEqual(['office', 'cell', 'home']);
    });

    test('submits only the name, with nulls and empty lists, when the rest is blank', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('Name'), 'Ann');
        await userEvent.click(submitButton());
        await settle();
        expect(onSubmit).toHaveBeenCalledWith(BLANK_PAYLOAD);
    });

    test('submits every field trimmed', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('Name'), '  Ann Lee ');
        await userEvent.type(screen.getByLabelText('Company'), ' Acme ');
        await userEvent.type(screen.getByLabelText('Role'), ' Buyer ');
        await userEvent.click(screen.getByRole('button', { name: 'Add email' }));
        await userEvent.type(screen.getByLabelText('Email 1'), ' ann@x.com ');
        await userEvent.click(screen.getByRole('button', { name: 'Add email' }));
        await userEvent.type(screen.getByLabelText('Email 2'), 'ann@y.com');
        await userEvent.click(screen.getByRole('button', { name: 'Add phone' }));
        await userEvent.type(screen.getByLabelText('Phone label 1'), ' cell ');
        await userEvent.type(screen.getByLabelText('Phone number 1'), ' 555-1 ');
        await userEvent.click(screen.getByRole('button', { name: 'Add phone' }));
        await userEvent.type(screen.getByLabelText('Phone label 2'), 'work fax');
        await userEvent.type(screen.getByLabelText('Phone number 2'), '555-2');
        await userEvent.click(screen.getByRole('checkbox', { name: 'Supplier' }));
        await userEvent.click(screen.getByRole('checkbox', { name: 'Client contact' }));
        await userEvent.type(screen.getByLabelText('Notes'), ' likes tea ');
        await userEvent.selectOptions(screen.getByLabelText('Place'), '7');
        await userEvent.type(screen.getByLabelText('Leemac client id'), ' c-9 ');
        await userEvent.type(screen.getByLabelText('Leemac client name'), ' Acme Co ');
        await userEvent.click(submitButton());
        await settle();

        expect(onSubmit).toHaveBeenCalledWith({
            name: 'Ann Lee',
            company: 'Acme',
            role: 'Buyer',
            emails: ['ann@x.com', 'ann@y.com'],
            phones: [
                { label: 'cell', number: '555-1' },
                { label: 'work fax', number: '555-2' },
            ],
            groups: ['client_contact', 'supplier'],
            notes: 'likes tea',
            placeId: 7,
            leemacClientId: 'c-9',
            leemacClientName: 'Acme Co',
        });
    });

    test('drops blank email and phone rows', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('Name'), 'Ann');
        await userEvent.click(screen.getByRole('button', { name: 'Add email' }));
        await userEvent.click(screen.getByRole('button', { name: 'Add email' }));
        await userEvent.type(screen.getByLabelText('Email 2'), 'a@b.c');
        await userEvent.click(screen.getByRole('button', { name: 'Add phone' }));
        await userEvent.type(screen.getByLabelText('Phone label 1'), 'cell');
        await userEvent.click(screen.getByRole('button', { name: 'Add phone' }));
        await userEvent.type(screen.getByLabelText('Phone number 2'), '555');
        await userEvent.click(submitButton());
        await settle();
        const sent = onSubmit.mock.calls[0][0];
        expect(sent.emails).toEqual(['a@b.c']);
        expect(sent.phones).toEqual([{ label: '', number: '555' }]);
    });

    test('Remove deletes just that row', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('Name'), 'Ann');
        for (const value of ['a@x.com', 'b@x.com']) {
            await userEvent.click(screen.getByRole('button', { name: 'Add email' }));
            const rows = screen.getAllByLabelText(/^Email \d$/);
            await userEvent.type(rows[rows.length - 1], value);
        }
        await userEvent.click(screen.getByRole('button', { name: 'Remove email 1' }));
        expect(screen.getAllByLabelText(/^Email \d$/)).toHaveLength(1);
        await userEvent.click(screen.getByRole('button', { name: 'Add phone' }));
        await userEvent.type(screen.getByLabelText('Phone number 1'), '555');
        await userEvent.click(screen.getByRole('button', { name: 'Remove phone 1' }));
        expect(screen.queryByLabelText('Phone number 1')).not.toBeInTheDocument();
        await userEvent.click(submitButton());
        await settle();
        const sent = onSubmit.mock.calls[0][0];
        expect(sent.emails).toEqual(['b@x.com']);
        expect(sent.phones).toEqual([]);
    });

    test.each(['', '   '])('refuses a blank name %j', async (text) => {
        const onSubmit = renderForm();
        if (text) await userEvent.type(screen.getByLabelText('Name'), `${text}{Enter}`);
        expect(submitButton()).toBeDisabled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    test('pre-fills from a person, turning place.id into the selected place', async () => {
        const onSubmit = renderForm({
            submitLabel: 'Save',
            initial: {
                id: 1,
                name: 'Ann',
                company: 'Acme',
                role: null,
                emails: ['a@x.com'],
                phones: [{ label: 'home', number: '555' }],
                groups: ['family', 'church'],
                notes: null,
                place: { id: 4, name: 'Shop', address: '1 Main' },
                leemacClientId: 'c-1',
                leemacClientName: null,
            },
        });
        expect(screen.getByLabelText('Name')).toHaveValue('Ann');
        expect(screen.getByLabelText('Company')).toHaveValue('Acme');
        expect(screen.getByLabelText('Role')).toHaveValue('');
        expect(screen.getByLabelText('Email 1')).toHaveValue('a@x.com');
        expect(screen.getByLabelText('Phone label 1')).toHaveValue('home');
        expect(screen.getByLabelText('Phone number 1')).toHaveValue('555');
        expect(screen.getByRole('checkbox', { name: 'Family' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Church' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Friend' })).not.toBeChecked();
        expect(screen.getByLabelText('Place')).toHaveValue('4');
        expect(screen.getByLabelText('Leemac client id')).toHaveValue('c-1');

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
        expect(onSubmit).toHaveBeenCalledWith({
            name: 'Ann',
            company: 'Acme',
            role: null,
            emails: ['a@x.com'],
            phones: [{ label: 'home', number: '555' }],
            groups: ['family', 'church'],
            notes: null,
            placeId: 4,
            leemacClientId: 'c-1',
            leemacClientName: null,
        });
    });

    test('a person without a place selects No place and sends placeId null', async () => {
        const onSubmit = renderForm({ initial: { ...BLANK_PAYLOAD, place: null } });
        expect(screen.getByLabelText('Place')).toHaveValue('');
        await userEvent.click(submitButton());
        await settle();
        expect(onSubmit.mock.calls[0][0].placeId).toBeNull();
    });

    test('clears everything after a successful add but keeps it on failure', async () => {
        const onSubmit = renderForm({ clearOnSuccess: true });
        await userEvent.type(screen.getByLabelText('Name'), 'Ann');
        await userEvent.click(screen.getByRole('button', { name: 'Add email' }));
        await userEvent.click(screen.getByRole('checkbox', { name: 'Friend' }));
        await userEvent.selectOptions(screen.getByLabelText('Place'), '4');
        onSubmit.mockResolvedValueOnce(false);
        await userEvent.click(submitButton());
        await settle();
        expect(screen.getByLabelText('Name')).toHaveValue('Ann');

        await userEvent.click(submitButton());
        await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
        expect(screen.queryByLabelText('Email 1')).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Friend' })).not.toBeChecked();
        expect(screen.getByLabelText('Place')).toHaveValue('');
    });

    test('Cancel shows only when onCancel is given', async () => {
        const onCancel = jest.fn();
        const { unmount } = render(
            <PersonForm submitLabel="Save" places={[]} onSubmit={jest.fn()} onCancel={onCancel} />
        );
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        unmount();
        render(<PersonForm submitLabel="Save" places={[]} onSubmit={jest.fn()} />);
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    describe('onDirtyChange', () => {
        test('reports false, true after typing a name, false after clearing it', async () => {
            const onDirtyChange = jest.fn();
            renderForm({ onDirtyChange });
            expect(onDirtyChange.mock.calls).toEqual([[false]]);
            await userEvent.type(screen.getByLabelText('Name'), 'A');
            expect(onDirtyChange.mock.calls).toEqual([[false], [true]]);
            await userEvent.clear(screen.getByLabelText('Name'));
            expect(onDirtyChange.mock.calls).toEqual([[false], [true], [false]]);
        });

        test('an edit form is clean until a field changes', async () => {
            const onDirtyChange = jest.fn();
            renderForm({
                onDirtyChange,
                initial: {
                    ...BLANK_PAYLOAD,
                    emails: ['a@x.com'],
                    phones: [{ label: 'home', number: '555' }],
                    place: { id: 4, name: 'Shop' },
                },
            });
            expect(onDirtyChange.mock.calls).toEqual([[false]]);
            await userEvent.type(screen.getByLabelText('Phone number 1'), '6');
            expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        });

        test('is clean again after a successful add clears the form', async () => {
            const onDirtyChange = jest.fn();
            renderForm({ onDirtyChange, clearOnSuccess: true });
            await userEvent.type(screen.getByLabelText('Name'), 'Ann');
            await userEvent.click(submitButton());
            await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
            expect(onDirtyChange).toHaveBeenCalledWith(true);
        });
    });
});
