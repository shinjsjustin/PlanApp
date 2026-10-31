import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChoreRow from './ChoreRow';

const chore = {
    id: 5, name: 'Clean bathrooms', area: 'Upstairs', notes: null, window: { min: 7, max: 10 },
    lastDone: { on: '2026-10-20', by: 'Jacklin' }, status: 'overdue',
};
const bare = { ...chore, area: null, window: { min: 1, max: 1 }, lastDone: null, status: 'never' };

it('shows name, area, window, last done label and the Overdue badge', () => {
    const { container } = render(<ChoreRow chore={chore} onDone={jest.fn()} onEdit={jest.fn()} />);
    const text = container.textContent;
    ['Clean bathrooms', 'Upstairs', '7-10 days', 'Last done 2026-10-20 by Jacklin', 'Overdue']
        .forEach((s) => expect(text).toContain(s));
    expect(container.querySelector('li.chore-row')).not.toBeNull();
});

it('omits area and badge when unset and not overdue', () => {
    const { container } = render(<ChoreRow chore={bare} onDone={jest.fn()} onEdit={jest.fn()} />);
    const text = container.textContent;
    expect(text).toContain('1 day');
    expect(text).toContain('Never done');
    expect(text).not.toContain('Overdue');
    expect(container.querySelectorAll('.chore-details li')).toHaveLength(2);
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
