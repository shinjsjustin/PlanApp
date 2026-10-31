import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChoreRow from './ChoreRow';

const chore = {
    id: 5, name: 'Clean bathrooms', area: 'Upstairs', notes: null, window: { min: 7, max: 10 },
    lastDone: { on: '2026-10-20', by: 'Jacklin' }, status: 'overdue',
};
const bare = { ...chore, area: null, window: { min: 1, max: 1 }, lastDone: null, status: 'never' };

it('shows name, area, window and last done label', () => {
    const { container } = render(<ChoreRow chore={chore} today="2026-10-31" onDone={jest.fn()} onEdit={jest.fn()} />);
    const text = container.textContent;
    ['Clean bathrooms', 'Upstairs', '7-10 days', 'Done 20 Oct \u00B7 Jacklin']
        .forEach((s) => expect(text).toContain(s));
    expect(container.querySelector('li.chore-row')).not.toBeNull();
});

it('includes the year when the last done date is in a different year', () => {
    const { container } = render(<ChoreRow chore={chore} today="2027-01-05" onDone={jest.fn()} onEdit={jest.fn()} />);
    expect(container.textContent).toContain('Done 20 Oct 2026 \u00B7 Jacklin');
});

it.each([
    ['overdue', 'Overdue'],
    ['due', 'Due now'],
    ['upcoming', 'Coming up'],
    ['never', 'Never done'],
])('shows one %s chip labelled %s', (status, label) => {
    const { container } = render(<ChoreRow chore={{ ...chore, status }} onDone={jest.fn()} onEdit={jest.fn()} />);
    const chips = container.querySelectorAll('.chore-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveClass(`chore-chip--${status}`);
    expect(chips[0].textContent).toBe(label);
});

it('omits area when unset', () => {
    const { container } = render(<ChoreRow chore={bare} onDone={jest.fn()} onEdit={jest.fn()} />);
    expect(container.textContent).toContain('1 day');
    expect(container.querySelectorAll('.chore-details li')).toHaveLength(2);
});

it('gives the li an id and highlights only when isHighlighted', () => {
    const { container, rerender } = render(<ChoreRow chore={chore} onDone={jest.fn()} onEdit={jest.fn()} />);
    const li = () => container.querySelector('li.chore-row');
    expect(li().id).toBe('chore-5');
    expect(li()).not.toHaveClass('chore-row--highlight');
    rerender(<ChoreRow chore={chore} isHighlighted onDone={jest.fn()} onEdit={jest.fn()} />);
    expect(li()).toHaveClass('chore-row--highlight');
});

it('calls onDone and onEdit with the chore', () => {
    const onDone = jest.fn();
    const onEdit = jest.fn();
    render(<ChoreRow chore={chore} onDone={onDone} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onDone).toHaveBeenCalledWith(chore);
    expect(onEdit).toHaveBeenCalledWith(chore);
    expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('chore-done');
});

it('shows a History button after Edit that calls onHistory with the chore', () => {
    const onHistory = jest.fn();
    render(<ChoreRow chore={chore} onDone={jest.fn()} onEdit={jest.fn()} onHistory={onHistory} />);
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Done', 'Edit', 'History']);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(onHistory).toHaveBeenCalledWith(chore);
});
