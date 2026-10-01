import React from 'react';
import { screen } from '@testing-library/react';

import { PinSelectionProvider, PIN_MODE } from './PinSelectionContext';
import { baseSequence, todo } from './sequenceCardHarness';
import { click } from '../../testUtils/interact';

const selection = (overrides = {}) => ({
    mode: PIN_MODE.pin,
    isEligible: () => false,
    isSelected: () => false,
    toggle: jest.fn(),
    isSequenceEligible: (sequence) => !sequence.isPinned,
    isSequenceSelected: () => false,
    toggleSequence: jest.fn(),
    isSaving: false,
    ...overrides,
});

// renderCard has no pin provider, so wrap the card by mocking its tree.
const renderWith = (value, options = {}) => {
    const Wrapper = ({ children }) => (
        <PinSelectionProvider value={value}>{children}</PinSelectionProvider>
    );
    const { ProjectProvider } = require('../../state/ProjectContext');
    const SequenceCard = require('./SequenceCard').default;
    const { render } = require('@testing-library/react');
    const { sequence = baseSequence, todos = [] } = options;
    const graph = {
        state: {
            project: { id: 1, title: 'P' },
            layers: { 10: { id: 10, projectId: 1, title: 'L', position: 0 } },
            sequences: { [sequence.id]: sequence },
            todos: Object.fromEntries(todos.map((t) => [t.id, t])),
        },
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
    };
    const tree = (s) => (
        <ProjectProvider value={graph}>
            <Wrapper><ul><SequenceCard sequence={s} todos={todos} /></ul></Wrapper>
        </ProjectProvider>
    );
    const view = render(tree(sequence));
    return { ...view, rerenderWith: (s) => view.rerender(tree(s)) };
};

describe('SequenceCard pinning', () => {
    test('shows a pressable select control for an eligible sequence', async () => {
        const value = selection({ isSequenceSelected: (id) => id === 100 });
        renderWith(value);

        const control = screen.getByRole('button', { name: 'Pin sequence “Learn aerodynamics”' });
        expect(control).toHaveAttribute('aria-pressed', 'true');

        await click(control);
        expect(value.toggleSequence).toHaveBeenCalledWith(100);
    });

    test('labels the control Unpin sequence in unpin mode', () => {
        renderWith(selection({ mode: PIN_MODE.unpin, isSequenceEligible: () => true }));

        expect(
            screen.getByRole('button', { name: 'Unpin sequence “Learn aerodynamics”' })
        ).toHaveAttribute('aria-pressed', 'false');
    });

    test('shows no control for an ineligible sequence', () => {
        renderWith(selection({ isSequenceEligible: () => false }));

        expect(screen.queryByRole('button', { name: /pin sequence/i })).not.toBeInTheDocument();
    });

    test('shows the control on a collapsed card too', () => {
        renderWith(selection(), { sequence: { ...baseSequence, isCollapsed: true } });

        expect(
            screen.getByRole('button', { name: 'Pin sequence “Learn aerodynamics”' })
        ).toBeInTheDocument();
    });

    test('keeps to-do rows selectable alongside the header control', async () => {
        const value = selection({
            isEligible: () => true,
            isSequenceEligible: () => true,
        });
        renderWith(value, { todos: [todo(1, 'incomplete')] });

        await click(screen.getByRole('button', { name: 'Pin “To-do 1”' }));
        expect(value.toggle).toHaveBeenCalledWith(1);
        expect(
            screen.getByRole('button', { name: 'Pin sequence “Learn aerodynamics”' })
        ).toBeInTheDocument();
    });

    test('the header control is not inside the card body', () => {
        renderWith(selection({ isSequenceEligible: () => true }));

        const control = screen.getByRole('button', { name: 'Pin sequence “Learn aerodynamics”' });
        expect(control.closest('.sequence-card-body')).toBeNull();
        expect(control.closest('.sequence-card-header')).not.toBeNull();
    });

    test.each([
        ['expanded', false],
        ['collapsed', true],
    ])('a pinned %s card shows a decorative pin marker', (_name, isCollapsed) => {
        const { container } = renderWith(selection({ isSequenceEligible: () => false }), {
            sequence: { ...baseSequence, isCollapsed, isPinned: true },
        });

        const markers = container.querySelectorAll('.sequence-pin-icon');
        expect(markers).toHaveLength(1);
        expect(markers[0]).toHaveAttribute('aria-hidden', 'true');
    });

    test('an unpinned card shows no marker', () => {
        const { container } = renderWith(selection({ isSequenceEligible: () => false }));

        expect(container.querySelector('.sequence-pin-icon')).toBeNull();
    });
});
