import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';
import { PinSelectionProvider } from './PinSelectionContext';
import SequenceCard from './SequenceCard';
import { baseSequence, graphValue, renderCard, todo } from './sequenceCardHarness';

const foldedSequence = { ...baseSequence, isCollapsed: true };
const styles = readFileSync(join(__dirname, '../Styling/SequenceCard.css'), 'utf8');

const preview = () => screen.getByRole('group', { name: 'Top pinned to-do' });

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

    test.each(['incomplete', 'blocked', 'complete'])('previews the earliest pin with its %s state', (status) => {
        const todos = [
            todo(30, 'incomplete', { isPinned: true }),
            todo(1, 'incomplete'),
            todo(10, status, { isPinned: true }),
            { ...todo(2, 'complete', { isPinned: true }), sequenceId: 200 },
        ];
        renderCard({ sequence: foldedSequence, todos });

        expect(preview()).toHaveTextContent('To-do 10');
        expect(preview()).toHaveClass(`sequence-card-pinned-preview--${status}`);
        expect(preview().querySelector('.todo-pin-icon')).toBeInTheDocument();
        expect(within(preview()).getByText(status === 'complete' ? 'Complete' : status === 'blocked' ? 'Blocked' : 'Incomplete')).toBeInTheDocument();
        expect(screen.queryByText('To-do 30')).not.toBeInTheDocument();
        expect(screen.queryByText('To-do 1')).not.toBeInTheDocument();
    });

    test('omits the preview when no filed to-do is pinned', () => {
        renderCard({ sequence: foldedSequence, todos: [todo(1, 'incomplete')] });
        expect(screen.queryByRole('group', { name: 'Top pinned to-do' })).not.toBeInTheDocument();
        expect(screen.getByText('1 to-do')).toBeInTheDocument();
    });

    test('updates the preview after the top pin is removed', () => {
        const first = todo(1, 'complete', { isPinned: true });
        const second = todo(2, 'blocked', { isPinned: true });
        const { rerenderWith } = renderCard({ sequence: foldedSequence, todos: [first, second] });

        rerenderWith(foldedSequence, [{ ...first, isPinned: false }, second]);

        expect(preview()).toHaveTextContent('To-do 2');
        expect(preview()).not.toHaveTextContent('To-do 1');
    });

    test('selects the preview for unpinning without unfolding or changing the to-do', async () => {
        const todos = [todo(1, 'complete', { isPinned: true })];
        const value = graphValue(foldedSequence, todos);
        const selection = {
            mode: 'unpin', isEligible: (entry) => entry.isPinned,
            isSelected: () => true, toggle: jest.fn(),
        };
        render(
            <ProjectProvider value={value}>
                <PinSelectionProvider value={selection}>
                    <ul><SequenceCard sequence={foldedSequence} todos={todos} /></ul>
                </PinSelectionProvider>
            </ProjectProvider>
        );

        const control = within(preview()).getByRole('button', { name: 'Unpin “To-do 1”' });
        expect(control).toHaveAttribute('aria-pressed', 'true');
        await click(control);
        control.focus();
        await act(async () => userEvent.keyboard('{Enter}'));

        expect(selection.toggle).toHaveBeenCalledTimes(2);
        expect(selection.toggle).toHaveBeenCalledWith(1);
        expect(value.updateEntity).not.toHaveBeenCalled();
        expect(value.removeEntity).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Expand Learn aerodynamics' })).toHaveAttribute('aria-expanded', 'false');
    });
});
