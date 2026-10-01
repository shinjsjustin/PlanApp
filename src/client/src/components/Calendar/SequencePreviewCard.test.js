import { render, screen, within } from '@testing-library/react';
import SequencePreviewCard from './SequencePreviewCard';

const sequence = (overrides = {}) => ({
    title: 'Launch',
    description: 'Ship it',
    isBlocked: false,
    todos: [
        { id: 3, text: 'third', status: 'incomplete', isPinned: false, position: 2 },
        { id: 1, text: 'first', status: 'incomplete', isPinned: true, position: 0 },
        { id: 2, text: 'finished', status: 'complete', isPinned: false, position: 1 },
    ],
    ...overrides,
});

test('renders title, description, outstanding to-dos in order and done count', () => {
    render(<SequencePreviewCard sequence={sequence()} />);
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('Launch')).toHaveClass('sequence-card-title');
    expect(within(tip).getByText('Ship it')).toHaveClass('sequence-card-description');
    const items = within(tip).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['first', 'third']);
    expect(within(tip).getByText('1 done')).toBeInTheDocument();
    expect(tip).toHaveClass('sequence-card', 'sequence-card--state-not-started');
});

test('wears the blocked face', () => {
    render(<SequencePreviewCard sequence={sequence({ isBlocked: true })} />);
    expect(screen.getByRole('tooltip')).toHaveClass('sequence-card--state-blocked');
});

test('wears the complete face when all to-dos are done', () => {
    const todos = [{ id: 1, text: 'a', status: 'complete', isPinned: false, position: 0 }];
    render(<SequencePreviewCard sequence={sequence({ todos })} />);
    expect(screen.getByRole('tooltip')).toHaveClass('sequence-card--state-complete');
    expect(screen.getByText('1 done')).toBeInTheDocument();
});

test('contains no controls', () => {
    render(<SequencePreviewCard sequence={sequence()} />);
    const tip = screen.getByRole('tooltip');
    expect(tip.querySelectorAll('button, input, a, textarea, select')).toHaveLength(0);
});
