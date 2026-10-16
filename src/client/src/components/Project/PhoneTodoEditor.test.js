import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';

import PhoneTodoEditor from './PhoneTodoEditor';
import useProjectMutations from '../../hooks/useProjectMutations';
import { SAVE_DELAY_MS } from './InlineTitle';

jest.mock('../../hooks/useProjectMutations');

const verbs = {
    renameTodo: jest.fn(),
    setTodoStatus: jest.fn(),
    deleteTodo: jest.fn(),
    updateTodoNote: jest.fn(),
};
const todo = { id: 7, text: 'Cut foam', status: 'blocked', note: 'Wait for glue' };

beforeEach(() => {
    jest.useFakeTimers();
    Object.values(verbs).forEach((v) => v.mockReset());
    useProjectMutations.mockReturnValue(verbs);
});
afterEach(() => jest.useRealTimers());

test('text edit calls renameTodo', () => {
    render(<PhoneTodoEditor todo={todo} onDone={jest.fn()} />);
    const field = screen.getByRole('textbox', { name: 'To-do text' });
    expect(field).toHaveValue('Cut foam');
    fireEvent.change(field, { target: { value: 'Cut wood' } });
    fireEvent.blur(field);
    act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
    expect(verbs.renameTodo).toHaveBeenCalledWith(7, 'Cut wood');
});

test('a pending text edit is flushed when the editor closes', () => {
    const { unmount } = render(<PhoneTodoEditor todo={todo} onDone={jest.fn()} />);
    const field = screen.getByRole('textbox', { name: 'To-do text' });
    fireEvent.change(field, { target: { value: 'Cut wood' } });
    fireEvent.blur(field);
    unmount();
    expect(verbs.renameTodo).toHaveBeenCalledWith(7, 'Cut wood');
});

test.each([
    ['Incomplete', 'incomplete'],
    ['Blocked', 'blocked'],
    ['Complete', 'complete'],
])('%s button sets status %s and only the current one is pressed', (name, status) => {
    render(<PhoneTodoEditor todo={todo} onDone={jest.fn()} />);
    const button = screen.getByRole('button', { name });
    expect(button).toHaveAttribute('aria-pressed', String(status === 'blocked'));
    fireEvent.click(button);
    expect(verbs.setTodoStatus).toHaveBeenCalledWith(7, status);
});

test('note is shown without stealing focus', () => {
    render(<PhoneTodoEditor todo={todo} onDone={jest.fn()} />);
    const note = screen.getByRole('textbox', { name: 'Note for “Cut foam”' });
    expect(note).toHaveValue('Wait for glue');
    expect(note).not.toHaveFocus();
});

test('Delete calls deleteTodo and then onDone', () => {
    const order = [];
    verbs.deleteTodo.mockImplementation(() => order.push('delete'));
    const onDone = jest.fn(() => order.push('done'));
    render(<PhoneTodoEditor todo={todo} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(verbs.deleteTodo).toHaveBeenCalledWith(7);
    expect(order).toEqual(['delete', 'done']);
});

test('Done calls onDone without deleting', () => {
    const onDone = jest.fn();
    render(<PhoneTodoEditor todo={todo} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(verbs.deleteTodo).not.toHaveBeenCalled();
});
