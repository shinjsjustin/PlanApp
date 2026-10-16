import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import PhoneSequenceDescription from './PhoneSequenceDescription';
import useProjectMutations from '../../hooks/useProjectMutations';

jest.mock('../../hooks/useProjectMutations');

const save = jest.fn();
const sequence = { id: 5, description: 'Stored' };
const field = () => screen.getByRole('textbox', { name: 'Sequence description' });
const edit = (value) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
    save.mockReset();
    useProjectMutations.mockReturnValue({ updateSequenceDescription: save });
});

test('shows the stored description with the server length limit', () => {
    render(<PhoneSequenceDescription sequence={sequence} />);
    expect(field()).toHaveValue('Stored');
    expect(field()).toHaveAttribute('maxlength', '2000');
});

test('shows an empty field when no description is set', () => {
    render(<PhoneSequenceDescription sequence={{ id: 5, description: null }} />);
    expect(field()).toHaveValue('');
});

test('typing then blur saves the draft once', () => {
    render(<PhoneSequenceDescription sequence={sequence} />);
    edit('New text');
    fireEvent.blur(field());
    fireEvent.blur(field());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(5, 'New text');
});

test('blur without an edit, or with an unchanged value, does not save', () => {
    render(<PhoneSequenceDescription sequence={sequence} />);
    fireEvent.blur(field());
    edit('Changed');
    edit('Stored');
    fireEvent.blur(field());
    expect(save).not.toHaveBeenCalled();
});

test('Escape reverts the draft and nothing is saved', () => {
    render(<PhoneSequenceDescription sequence={sequence} />);
    edit('Oops');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field()).toHaveValue('Stored');
    fireEvent.blur(field());
    expect(save).not.toHaveBeenCalled();
});

test('unmounting with an unsaved edit saves it', () => {
    const { unmount } = render(<PhoneSequenceDescription sequence={sequence} />);
    edit('Pending');
    unmount();
    expect(save).toHaveBeenCalledWith(5, 'Pending');
});

test('unmounting without an edit saves nothing', () => {
    const { unmount } = render(<PhoneSequenceDescription sequence={sequence} />);
    unmount();
    expect(save).not.toHaveBeenCalled();
});
