import React from 'react';
import { render, screen } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import DeleteBubble from './DeleteBubble';

// The one delete affordance in the app: a red × in the corner of whatever it is
// dropped into, hidden until that thing is hovered or the × itself is tabbed to.
//
// The reveal is CSS, and jsdom has no layout to judge it with — what a unit test
// can hold is the half the markup owns: the button is always rendered, always in
// the tab order, and always carries a name that says what it would delete. That
// last one is why the label is required rather than defaulted: a bare × with no
// name is the failure this component exists to prevent, and a default would let
// it through quietly.

describe('DeleteBubble', () => {
    test('renders a button named by the label it is given', () => {
        // Act
        render(<DeleteBubble label="Delete “Build a drone”" onDelete={jest.fn()} />);

        // Assert
        expect(
            screen.getByRole('button', { name: 'Delete “Build a drone”' })
        ).toBeInTheDocument();
    });

    test('keeps the glyph out of the accessible name', () => {
        // Act
        render(<DeleteBubble label="Delete “Build a drone”" onDelete={jest.fn()} />);

        // Assert — not "Delete “Build a drone” ×".
        expect(screen.getByRole('button')).toHaveAccessibleName('Delete “Build a drone”');
    });

    test('is a plain button, so it never submits a form it is dropped into', () => {
        // Act
        render(<DeleteBubble label="Delete it" onDelete={jest.fn()} />);

        // Assert
        expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    test('runs the delete it was handed', async () => {
        // Arrange
        const onDelete = jest.fn();
        render(<DeleteBubble label="Delete it" onDelete={onDelete} />);

        // Act
        await click(screen.getByRole('button'));

        // Assert
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    test('stays in the tab order, so it can be reached without a pointer', () => {
        // Act
        render(<DeleteBubble label="Delete it" onDelete={jest.fn()} />);

        // Assert — nothing takes it out, and nothing hides it from the tree.
        const bubble = screen.getByRole('button');
        expect(bubble).not.toHaveAttribute('tabindex');
        expect(bubble).not.toHaveAttribute('aria-hidden');
    });

    test('carries the shared class, so one CSS block reveals every bubble', () => {
        // Act
        render(<DeleteBubble label="Delete it" onDelete={jest.fn()} />);

        // Assert
        expect(screen.getByRole('button')).toHaveClass('delete-bubble');
    });

    test('takes a host class without dropping the shared one', () => {
        // Act
        render(<DeleteBubble label="Delete it" onDelete={jest.fn()} className="extra" />);

        // Assert
        expect(screen.getByRole('button')).toHaveClass('delete-bubble', 'extra');
    });

    test('refuses to render unlabelled, rather than shipping a nameless ×', () => {
        // Arrange — React logs the throw as it unwinds; the assertion is the point.
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

        try {
            // Act & Assert
            expect(() => render(<DeleteBubble onDelete={jest.fn()} />)).toThrow(/label/i);
        } finally {
            logged.mockRestore();
        }
    });
});
