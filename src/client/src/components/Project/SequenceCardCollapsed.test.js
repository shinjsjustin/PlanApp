import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { screen } from '@testing-library/react';

import { baseSequence, renderCard, todo } from './sequenceCardHarness';

const foldedSequence = { ...baseSequence, isCollapsed: true };
const styles = readFileSync(join(__dirname, '../Styling/SequenceCard.css'), 'utf8');

describe('collapsed sequence presentation', () => {
    test.each([false, true])('preserves multiline descriptions when collapsed is %s', (isCollapsed) => {
        const description = 'First line\nSecond line';
        const { container } = renderCard({ sequence: { ...baseSequence, isCollapsed, description } });
        const style = document.createElement('style');
        style.textContent = styles;
        document.head.appendChild(style);

        const paragraph = container.querySelector('.sequence-card-description');
        expect(paragraph).toHaveTextContent('First line Second line');
        expect(paragraph.textContent).toBe(description);
        expect(getComputedStyle(paragraph).whiteSpace).toBe('pre-wrap');
        style.remove();
    });

    test.each([null, '', '   '])('shows the exact prompt for an empty description (%s)', (description) => {
        renderCard({ sequence: { ...foldedSequence, description } });
        expect(screen.getByText('What problem are you trying to solve?')).toBeInTheDocument();
    });

    test('shows no top-pin preview or pin icon for a card holding pinned to-dos', () => {
        const todos = [
            todo(30, 'incomplete', { isPinned: true }),
            todo(1, 'incomplete'),
        ];
        const { container } = renderCard({ sequence: { ...foldedSequence, isPinned: true }, todos });

        expect(screen.queryByRole('group', { name: 'Top pinned to-do' })).not.toBeInTheDocument();
        expect(screen.queryByText('To-do 30')).not.toBeInTheDocument();
        expect(container.querySelector('.sequence-pin-icon, .todo-pin-icon, .pin-select-control')).not.toBeInTheDocument();
        expect(screen.getByText('2 to-dos')).toBeInTheDocument();
    });
});
