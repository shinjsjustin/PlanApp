import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PlaceForm, { VISIT_OPTIONS, formatVisit } from './PlaceForm';

const KINDS = ['home', 'work', 'client', 'church', 'supplier', 'other'];

const renderForm = (props = {}) => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<PlaceForm submitLabel="Add place" onSubmit={onSubmit} {...props} />);
    return onSubmit;
};

const optionTexts = (name) =>
    within(screen.getByLabelText(name)).getAllByRole('option').map((o) => o.textContent);

describe('PlaceForm', () => {
    test('has labelled Name, Address, Kind, Notes and Usual visit fields', () => {
        renderForm();
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Address')).toBeInTheDocument();
        expect(screen.getByLabelText('Kind')).toBeInTheDocument();
        expect(screen.getByLabelText('Notes')).toBeInTheDocument();
        expect(screen.getByLabelText('Usual visit')).toBeInTheDocument();
    });

    test('Kind offers the six kinds, without person', () => {
        renderForm();
        const values = within(screen.getByLabelText('Kind')).getAllByRole('option').map((o) => o.value);
        expect(values).toEqual(KINDS);
    });

    test('Usual visit offers None then 15 min to 12 h in 5-minute steps', () => {
        renderForm();
        const texts = optionTexts('Usual visit');
        expect(texts).toHaveLength(143);
        expect(texts.slice(0, 4)).toEqual(['None', '15 min', '20 min', '25 min']);
        expect(texts[142]).toBe('12 h');
        const values = within(screen.getByLabelText('Usual visit')).getAllByRole('option').map((o) => o.value);
        expect(values.slice(0, 3)).toEqual(['', '15', '20']);
        expect(values[142]).toBe('720');
    });

    test('VISIT_OPTIONS runs 15 to 720 in steps of 5', () => {
        expect(VISIT_OPTIONS[0]).toBe(15);
        expect(VISIT_OPTIONS[1]).toBe(20);
        expect(VISIT_OPTIONS[VISIT_OPTIONS.length - 1]).toBe(720);
        expect(VISIT_OPTIONS.every((m, i) => i === 0 || m - VISIT_OPTIONS[i - 1] === 5)).toBe(true);
    });

    test.each([
        [45, '45 min'],
        [60, '1 h'],
        [65, '1 h 5 min'],
    ])('formatVisit(%i) reads %s', (minutes, text) => {
        expect(formatVisit(minutes)).toBe(text);
    });

    test('an existing 90-minute place opens with 90 selected', () => {
        renderForm({
            initial: { name: 'Shop', address: '2 Side St', kind: 'supplier', notes: null, visitMinutes: 90 },
        });
        expect(screen.getByLabelText('Usual visit')).toHaveValue('90');
    });

    test('an existing 30-minute place opens with 30 selected', () => {
        renderForm({
            initial: { name: 'Shop', address: '2 Side St', kind: 'supplier', notes: null, visitMinutes: 30 },
        });
        expect(screen.getByLabelText('Usual visit')).toHaveValue('30');
    });

    test('submits trimmed fields with visitMinutes as a number', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('Name'), '  Shop ');
        await userEvent.type(screen.getByLabelText('Address'), ' 2 Side St ');
        await userEvent.selectOptions(screen.getByLabelText('Kind'), 'supplier');
        await userEvent.type(screen.getByLabelText('Notes'), 'ring bell');
        await userEvent.selectOptions(screen.getByLabelText('Usual visit'), '90');
        await userEvent.click(screen.getByRole('button', { name: 'Add place' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add place' })).toBeEnabled());

        expect(onSubmit).toHaveBeenCalledWith({
            name: 'Shop',
            address: '2 Side St',
            kind: 'supplier',
            notes: 'ring bell',
            visitMinutes: 90,
        });
    });

    test('sends visitMinutes null for None and notes null when blank', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('Name'), 'Shop');
        await userEvent.type(screen.getByLabelText('Address'), '2 Side St');
        await userEvent.click(screen.getByRole('button', { name: 'Add place' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add place' })).toBeEnabled());

        expect(onSubmit).toHaveBeenCalledWith({
            name: 'Shop',
            address: '2 Side St',
            kind: 'home',
            notes: null,
            visitMinutes: null,
        });
    });

    test.each([
        ['name', 'Name'],
        ['address', 'Address'],
    ])('refuses a blank %s', async (_f, label) => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('Name'), 'Shop');
        await userEvent.type(screen.getByLabelText('Address'), '2 Side St');
        await userEvent.clear(screen.getByLabelText(label));
        await userEvent.type(screen.getByLabelText(label), '   {Enter}');

        expect(screen.getByRole('button', { name: 'Add place' })).toBeDisabled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    test('starts from the given place when editing', () => {
        renderForm({
            initial: { name: 'Shop', address: '2 Side St', kind: 'supplier', notes: null, visitMinutes: 60 },
            submitLabel: 'Save',
        });
        expect(screen.getByLabelText('Name')).toHaveValue('Shop');
        expect(screen.getByLabelText('Address')).toHaveValue('2 Side St');
        expect(screen.getByLabelText('Kind')).toHaveValue('supplier');
        expect(screen.getByLabelText('Notes')).toHaveValue('');
        expect(screen.getByLabelText('Usual visit')).toHaveValue('60');
    });

    test('clears the fields after a successful add but keeps them on failure', async () => {
        const onSubmit = renderForm({ clearOnSuccess: true });
        await userEvent.type(screen.getByLabelText('Name'), 'Shop');
        await userEvent.type(screen.getByLabelText('Address'), '2 Side St');
        onSubmit.mockResolvedValueOnce(false);
        await userEvent.click(screen.getByRole('button', { name: 'Add place' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add place' })).toBeEnabled());
        expect(screen.getByLabelText('Name')).toHaveValue('Shop');

        await userEvent.click(screen.getByRole('button', { name: 'Add place' }));
        await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
        expect(screen.getByLabelText('Address')).toHaveValue('');
    });

    test('Cancel calls onCancel when provided', async () => {
        const onCancel = jest.fn();
        renderForm({ onCancel });
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    test('has no Cancel button without onCancel', () => {
        renderForm();
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    describe('onDirtyChange', () => {
        test('reports false, true after typing a name, false after clearing it', async () => {
            const onDirtyChange = jest.fn();
            renderForm({ onDirtyChange });
            expect(onDirtyChange.mock.calls).toEqual([[false]]);
            await userEvent.type(screen.getByLabelText('Name'), 'S');
            expect(onDirtyChange.mock.calls).toEqual([[false], [true]]);
            await userEvent.clear(screen.getByLabelText('Name'));
            expect(onDirtyChange.mock.calls).toEqual([[false], [true], [false]]);
        });

        test('an edit form is clean until a field changes', async () => {
            const onDirtyChange = jest.fn();
            renderForm({
                onDirtyChange,
                initial: { name: 'Shop', address: '2 Side St', kind: 'supplier', notes: null, visitMinutes: 60 },
            });
            expect(onDirtyChange.mock.calls).toEqual([[false]]);
            await userEvent.selectOptions(screen.getByLabelText('Usual visit'), '90');
            expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        });

        test('is clean again after a successful add clears the form', async () => {
            const onDirtyChange = jest.fn();
            renderForm({ onDirtyChange, clearOnSuccess: true });
            await userEvent.type(screen.getByLabelText('Name'), 'Shop');
            await userEvent.type(screen.getByLabelText('Address'), '2 Side St');
            await userEvent.click(screen.getByRole('button', { name: 'Add place' }));
            await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
            expect(onDirtyChange).toHaveBeenCalledWith(true);
        });
    });
});
