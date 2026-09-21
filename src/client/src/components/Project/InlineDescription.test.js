import React from 'react';
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';

import InlineDescription, { SAVE_DELAY_MS } from './InlineDescription';
import useProjectMutations from '../../hooks/useProjectMutations';

jest.mock('../../hooks/useProjectMutations');

const save = jest.fn();
const field = () => screen.getByRole('textbox', { name: 'Project description' });
const advance = () => act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
const edit = (value) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
    jest.useFakeTimers();
    save.mockReset();
    useProjectMutations.mockReturnValue({ updateProjectDescription: save });
});
afterEach(() => jest.useRealTimers());

test('renders the stored multiline description with the server length limit', () => {
    render(<InlineDescription value={'First\nSecond'} />);
    expect(field()).toHaveValue('First\nSecond');
    expect(field()).toHaveAttribute('maxlength', '2000');
});

test('shows the exact prompt without saving placeholder content', () => {
    render(<InlineDescription value={null} />);
    expect(field()).toHaveAttribute('placeholder', 'What problem are you trying to solve?');
    expect(field()).toHaveValue('');
    fireEvent.blur(field());
    advance();
    expect(save).not.toHaveBeenCalled();
});

test('leaves plain Enter to insert a newline without saving', () => {
    render(<InlineDescription value="Stored" />);
    const enter = createEvent.keyDown(field(), { key: 'Enter' });
    fireEvent(field(), enter);
    expect(enter.defaultPrevented).toBe(false);
    // jsdom does not perform the browser's default text insertion.
    edit('Stored\nNext');
    advance();
    expect(field()).toHaveValue('Stored\nNext');
    expect(save).not.toHaveBeenCalled();
});

test.each(['metaKey', 'ctrlKey'])('%s Enter commits once even with a later blur', (modifier) => {
    render(<InlineDescription value="Stored" />);
    edit('First\nSecond');
    fireEvent.keyDown(field(), { key: 'Enter', [modifier]: true });
    advance();
    fireEvent.blur(field());
    advance();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('First\nSecond');
});

test('debounces blur and keyboard commit into one save', () => {
    render(<InlineDescription value="Stored" />);
    edit('Draft');
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    fireEvent.blur(field());
    expect(save).not.toHaveBeenCalled();
    advance();
    expect(save).toHaveBeenCalledTimes(1);
});

test('saves the raw multiline draft on debounced blur for boundary normalization', () => {
    render(<InlineDescription value="Stored" />);
    edit('  First\n\nSecond  ');
    fireEvent.blur(field());
    expect(save).not.toHaveBeenCalled();
    expect(field()).toHaveValue('  First\n\nSecond  ');
    advance();
    expect(save).toHaveBeenCalledWith('  First\n\nSecond  ');
});

test('Escape cancels a pending save and restores stored text without a blur save', () => {
    render(<InlineDescription value="Stored" />);
    edit('Draft');
    fireEvent.blur(field());
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.blur(field());
    advance();
    expect(field()).toHaveValue('Stored');
    expect(save).not.toHaveBeenCalled();
});

test('cancels an older pending draft when editing resumes', () => {
    render(<InlineDescription value="Stored" />);
    edit('Old draft');
    fireEvent.blur(field());
    edit('New draft');
    advance();
    expect(save).not.toHaveBeenCalled();
    expect(field()).toHaveValue('New draft');
});

test('does not overwrite typing on stored updates and Escape restores the latest value', () => {
    const { rerender } = render(<InlineDescription value="Stored" />);
    edit('Draft');
    rerender(<InlineDescription value="Updated" />);
    expect(field()).toHaveValue('Draft');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field()).toHaveValue('Updated');
});

test('shows the normalized stored value after saving in StrictMode', () => {
    const { rerender } = render(
        <React.StrictMode><InlineDescription value="Stored" /></React.StrictMode>
    );
    edit('  First\n\nSecond  ');
    fireEvent.blur(field());
    advance();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('  First\n\nSecond  ');

    rerender(
        <React.StrictMode><InlineDescription value={'First\n\nSecond'} /></React.StrictMode>
    );
    expect(field()).toHaveValue('First\n\nSecond');
});

test('shows the stored rollback value after a failed save in StrictMode', () => {
    const { rerender } = render(
        <React.StrictMode><InlineDescription value="Stored" /></React.StrictMode>
    );
    edit('Optimistic draft');
    fireEvent.blur(field());
    advance();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('Optimistic draft');

    // The mutation hook supplies optimistic and rollback values through the graph.
    rerender(
        <React.StrictMode><InlineDescription value="Optimistic draft" /></React.StrictMode>
    );
    expect(field()).toHaveValue('Optimistic draft');
    rerender(
        <React.StrictMode><InlineDescription value="Stored" /></React.StrictMode>
    );
    expect(field()).toHaveValue('Stored');
});

test('flushes a committed draft on unmount so navigation cannot discard it', () => {
    const { unmount } = render(<InlineDescription value="Stored" />);
    edit('Draft');
    fireEvent.blur(field());
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('Draft');
    advance();
    expect(save).toHaveBeenCalledTimes(1);
});
