import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import InlineTitle from './InlineTitle';

const field = () => screen.getByRole('textbox', { name: 'Title' });

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

test('flushOnUnmount saves a blurred edit when unmounted before the debounce fires', () => {
    const onSave = jest.fn();
    const { unmount } = render(<InlineTitle value="Old" label="Title" onSave={onSave} flushOnUnmount />);

    fireEvent.change(field(), { target: { value: '  New  ' } });
    fireEvent.blur(field());
    unmount();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('New');
});

test('without flushOnUnmount a pending save is dropped on unmount', () => {
    const onSave = jest.fn();
    const { unmount } = render(<InlineTitle value="Old" label="Title" onSave={onSave} />);

    fireEvent.change(field(), { target: { value: 'New' } });
    fireEvent.blur(field());
    unmount();
    jest.runAllTimers();

    expect(onSave).not.toHaveBeenCalled();
});
