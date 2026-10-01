import React from 'react';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';

import TodoNote from './TodoNote';
import useProjectMutations from '../../hooks/useProjectMutations';

jest.mock('../../hooks/useProjectMutations');

const save = jest.fn();
const todo = { id: 7, text: 'Buy propellers', note: 'Stored' };
const field = () => screen.getByRole('textbox', { name: 'Note for “Buy propellers”' });
const edit = (value) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
    save.mockReset();
    useProjectMutations.mockReturnValue({ updateTodoNote: save });
});

test('shows the stored note, autofocused, with the server length limit', () => {
    render(<TodoNote todo={todo} />);
    expect(field()).toHaveValue('Stored');
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute('maxlength', '5000');
});

test('typing then blur saves the draft once', () => {
    render(<TodoNote todo={todo} />);
    edit('Draft\nmore');
    fireEvent.blur(field());
    fireEvent.blur(field());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(7, 'Draft\nmore');
});

test('Enter is a newline and does not save', () => {
    render(<TodoNote todo={todo} />);
    edit('Draft');
    const enter = createEvent.keyDown(field(), { key: 'Enter' });
    fireEvent(field(), enter);
    expect(enter.defaultPrevented).toBe(false);
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(field(), { key: 'Enter', metaKey: true });
    expect(save).not.toHaveBeenCalled();
});

test('Escape restores the saved note without saving, even on the following blur', () => {
    render(<TodoNote todo={todo} />);
    edit('Draft');
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.blur(field());
    expect(field()).toHaveValue('Stored');
    expect(save).not.toHaveBeenCalled();
});

test('an unchanged blur sends nothing', () => {
    render(<TodoNote todo={todo} />);
    fireEvent.blur(field());
    edit('Stored');
    fireEvent.blur(field());
    expect(save).not.toHaveBeenCalled();
});

test('unmounting with a pending edit saves it once', () => {
    const { unmount } = render(<TodoNote todo={todo} />);
    edit('Draft');
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(7, 'Draft');
});

test('unmounting after a blur save does not save again', () => {
    const { unmount } = render(<TodoNote todo={todo} />);
    edit('Draft');
    fireEvent.blur(field());
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
});

test('unmounting without edits sends nothing', () => {
    const { unmount } = render(<TodoNote todo={todo} />);
    unmount();
    expect(save).not.toHaveBeenCalled();
});

test('keydown and pointerdown do not reach parents', () => {
    const parentKey = jest.fn();
    const parentPointer = jest.fn();
    render(
        <div onKeyDown={parentKey} onPointerDown={parentPointer}>
            <TodoNote todo={todo} />
        </div>
    );
    fireEvent.keyDown(field(), { key: 'a' });
    fireEvent.pointerDown(field());
    expect(parentKey).not.toHaveBeenCalled();
    expect(parentPointer).not.toHaveBeenCalled();
});
