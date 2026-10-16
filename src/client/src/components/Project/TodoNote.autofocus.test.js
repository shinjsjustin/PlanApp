import React from 'react';
import { render, screen } from '@testing-library/react';

import TodoNote from './TodoNote';
import useProjectMutations from '../../hooks/useProjectMutations';

jest.mock('../../hooks/useProjectMutations');

const todo = { id: 7, text: 'Buy propellers', note: 'Stored' };
const field = () => screen.getByRole('textbox', { name: 'Note for “Buy propellers”' });

beforeEach(() => {
    useProjectMutations.mockReturnValue({ updateTodoNote: jest.fn() });
});

test('autoFocus={false} does not take focus on mount', () => {
    render(<TodoNote todo={todo} autoFocus={false} />);
    expect(field()).not.toHaveFocus();
});

test('takes focus on mount when no prop is given', () => {
    render(<TodoNote todo={todo} />);
    expect(field()).toHaveFocus();
});
