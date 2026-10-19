import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FormDialog, { confirmDiscard } from './FormDialog';

const renderDialog = (props = {}) =>
    render(
        <FormDialog title="Add person" isDirty={false} onClose={jest.fn()} {...props}>
            <input aria-label="Name" />
            <button type="button">Save</button>
        </FormDialog>
    );

describe('FormDialog', () => {
    let confirmSpy;

    beforeEach(() => {
        confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
        confirmSpy.mockRestore();
    });

    test('renders a modal dialog on the body labelled by its title, with children', () => {
        const { container } = renderDialog();

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAccessibleName('Add person');
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
        expect(container).toBeEmptyDOMElement();
        expect(dialog.parentElement.parentElement).toBe(document.body);
    });

    test('shows the error as an alert only when given', () => {
        const { rerender } = renderDialog();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        rerender(
            <FormDialog title="Add person" isDirty={false} error="Save failed" onClose={jest.fn()}>
                <input aria-label="Name" />
            </FormDialog>
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
    });

    test('Escape closes at once when clean', () => {
        const onClose = jest.fn();
        renderDialog({ onClose });

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    test('Escape when dirty closes only after the discard confirm is accepted', () => {
        const onClose = jest.fn();
        renderDialog({ onClose, isDirty: true });

        confirmSpy.mockReturnValueOnce(false);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(confirmSpy).toHaveBeenCalledWith('Discard this entry?');
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('backdrop mousedown closes when clean, but a mousedown in the panel never does', () => {
        const onClose = jest.fn();
        renderDialog({ onClose });

        fireEvent.mouseDown(screen.getByRole('dialog'));
        fireEvent.mouseDown(screen.getByLabelText('Name'));
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('backdrop mousedown when dirty asks first and stays open on refusal', () => {
        const onClose = jest.fn();
        renderDialog({ onClose, isDirty: true });
        confirmSpy.mockReturnValueOnce(false);

        fireEvent.mouseDown(screen.getByRole('dialog').parentElement);

        expect(confirmSpy).toHaveBeenCalledWith('Discard this entry?');
        expect(onClose).not.toHaveBeenCalled();
    });

    test('confirmDiscard is true when clean without asking, else follows the confirm', () => {
        expect(confirmDiscard(false)).toBe(true);
        expect(confirmSpy).not.toHaveBeenCalled();

        confirmSpy.mockReturnValueOnce(false);
        expect(confirmDiscard(true)).toBe(false);
        expect(confirmDiscard(true)).toBe(true);
    });

    test('focuses the first field on open', () => {
        renderDialog();
        expect(screen.getByLabelText('Name')).toHaveFocus();
    });

    test('Tab and Shift+Tab wrap inside the panel', () => {
        renderDialog();
        const name = screen.getByLabelText('Name');
        const save = screen.getByRole('button', { name: 'Save' });

        save.focus();
        userEvent.tab();
        expect(name).toHaveFocus();

        userEvent.tab({ shift: true });
        expect(save).toHaveFocus();
    });

    test('returns focus to the previously focused element on unmount', () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();

        const { unmount } = renderDialog();
        expect(opener).not.toHaveFocus();

        unmount();
        expect(opener).toHaveFocus();
        opener.remove();
    });
});
