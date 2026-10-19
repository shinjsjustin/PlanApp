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
});
