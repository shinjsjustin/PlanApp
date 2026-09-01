import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import InlineTitle from './InlineTitle';

// `fireEvent` rather than `user-event` throughout: these assertions turn on
// timers, and driving the field directly keeps the debounce the only clock in
// play.

const SAVE_DELAY = 400;

const renderTitle = (props = {}) =>
    render(<InlineTitle value="Learning" label="Layer title" onSave={jest.fn()} {...props} />);

const field = () => screen.getByRole('textbox', { name: 'Layer title' });

const settle = () => act(() => jest.advanceTimersByTime(SAVE_DELAY));

const edit = (text) => fireEvent.change(field(), { target: { value: text } });

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('InlineTitle', () => {
    test('shows the current value', () => {
        // Act
        renderTitle();

        // Assert
        expect(field()).toHaveValue('Learning');
    });

    test('saves what was typed when the field is blurred', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        edit('Foundations');
        fireEvent.blur(field());
        settle();

        // Assert
        expect(onSave).toHaveBeenCalledWith('Foundations');
    });

    test('saves on Enter', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        edit('Foundations');
        fireEvent.keyDown(field(), { key: 'Enter' });
        settle();

        // Assert
        expect(onSave).toHaveBeenCalledWith('Foundations');
    });

    test('sends one request when Enter is followed by the blur it causes', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        edit('Foundations');
        fireEvent.keyDown(field(), { key: 'Enter' });
        fireEvent.blur(field());
        settle();

        // Assert
        expect(onSave).toHaveBeenCalledTimes(1);
    });

    test('trims the value before saving it', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        edit('  Foundations  ');
        fireEvent.blur(field());
        settle();

        // Assert
        expect(onSave).toHaveBeenCalledWith('Foundations');
    });

    test('saves nothing when the value has not changed', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        fireEvent.focus(field());
        fireEvent.blur(field());
        settle();

        // Assert
        expect(onSave).not.toHaveBeenCalled();
    });

    test('refuses a blank title and puts the old one back', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        edit('   ');
        fireEvent.blur(field());
        settle();

        // Assert
        expect(onSave).not.toHaveBeenCalled();
        expect(field()).toHaveValue('Learning');
    });

    test('Escape puts the old title back on screen', () => {
        // Arrange
        renderTitle();

        // Act
        edit('Typo');
        fireEvent.keyDown(field(), { key: 'Escape' });

        // Assert
        expect(field()).toHaveValue('Learning');
    });

    test('Escape takes back a save that has not gone out yet', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        edit('Typo');
        fireEvent.keyDown(field(), { key: 'Enter' });
        fireEvent.keyDown(field(), { key: 'Escape' });
        settle();

        // Assert
        expect(onSave).not.toHaveBeenCalled();
    });

    test('saves nothing after Escape when the field is then blurred', () => {
        // Arrange
        const onSave = jest.fn();
        renderTitle({ onSave });

        // Act
        edit('Typo');
        fireEvent.keyDown(field(), { key: 'Escape' });
        fireEvent.blur(field());
        settle();

        // Assert
        expect(onSave).not.toHaveBeenCalled();
    });

    test('picks up a new value from the server while the field is idle', () => {
        // Arrange — the reconciled entity may differ from what was typed.
        const { rerender } = renderTitle();

        // Act
        rerender(<InlineTitle value="Foundations" label="Layer title" onSave={jest.fn()} />);

        // Assert
        expect(field()).toHaveValue('Foundations');
    });

    test('does not overwrite what is being typed when the graph re-renders', () => {
        // Arrange
        const { rerender } = renderTitle();

        // Act
        edit('Half-typed');
        rerender(<InlineTitle value="Learning" label="Layer title" onSave={jest.fn()} />);

        // Assert
        expect(field()).toHaveValue('Half-typed');
    });
});
