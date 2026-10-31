import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChoreTimeline from './ChoreTimeline';

const today = '2026-10-31';
const base = { area: null, notes: null, window: { min: 1, max: 1 }, lastDone: null, status: 'due' };
const late = { ...base, id: 1, name: 'Mop', dueFrom: '2026-10-28', dueBy: '2026-10-29', status: 'overdue' };
const open = { ...base, id: 2, name: 'Dust', dueFrom: '2026-10-30', dueBy: '2026-11-02' };
const future = { ...base, id: 3, name: 'Vacuum', dueFrom: '2026-11-05', dueBy: '2026-11-08', status: 'upcoming' };
const never = { ...base, id: 4, name: 'Gutters', dueFrom: null, dueBy: null, status: 'never' };
const cut = { ...base, id: 5, name: 'Oven', dueFrom: '2026-10-01', dueBy: '2026-12-01', status: 'overdue' };

const renderIt = (chores, onSelect = jest.fn()) =>
    render(<ChoreTimeline chores={chores} today={today} onSelect={onSelect} />);

it('renders one named row per dated chore in the given order, skipping never-done', () => {
    const { container } = renderIt([open, never, late]);
    const rows = container.querySelectorAll('button.chore-timeline-row');
    expect([...rows].map((r) => r.querySelector('.chore-timeline-label').textContent)).toEqual(['Dust', 'Mop']);
    expect(screen.getByRole('button', { name: 'Dust' })).toBe(rows[0]);
    expect(container.querySelector('section.chore-timeline')).toHaveAccessibleName('Schedule');
});

it('places bars with tone, cut modifiers and a tail only when late', () => {
    const { container } = renderIt([late, open, future, cut]);
    const bars = [...container.querySelectorAll('.chore-timeline-bar')];
    expect(bars[0]).toHaveClass('chore-timeline-bar--late');
    expect(bars[1]).toHaveClass('chore-timeline-bar--open');
    expect(bars[2]).toHaveClass('chore-timeline-bar--future');
    expect(bars[3]).toHaveClass('chore-timeline-bar--cut-start', 'chore-timeline-bar--cut-end');
    expect(bars[0]).not.toHaveClass('chore-timeline-bar--cut-start');
    // late: dueFrom 10-28 is day 1 of 21; width two days
    expect(parseFloat(bars[0].style.left)).toBeCloseTo((1 / 21) * 100, 3);
    expect(parseFloat(bars[0].style.width)).toBeCloseTo((2 / 21) * 100, 3);
    const rows = container.querySelectorAll('.chore-timeline-row');
    expect(rows[0].querySelectorAll('.chore-timeline-tail')).toHaveLength(1);
    expect(rows[1].querySelector('.chore-timeline-tail')).toBeNull();
    // tail runs from end of dueBy (day 3) to NOW (day 4.5)
    const tail = rows[0].querySelector('.chore-timeline-tail');
    expect(parseFloat(tail.style.left)).toBeCloseTo((3 / 21) * 100, 3);
    expect(parseFloat(tail.style.width)).toBeCloseTo((1.5 / 21) * 100, 3);
});

it('renders head with NOW tag and week labels, a day grid holding an empty NOW line, then rows', () => {
    const { container } = renderIt([open]);
    const track = container.querySelector('.chore-timeline-track');
    expect([...track.children].map((c) => c.className)).toEqual([
        'chore-timeline-head', 'chore-timeline-grid', 'chore-timeline-row',
    ]);
    const head = track.querySelector('.chore-timeline-head');
    const tag = head.querySelector('.chore-timeline-now-tag');
    expect(tag.textContent).toBe('NOW');
    expect(parseFloat(tag.style.left)).toBeCloseTo((4.5 / 21) * 100, 3);
    expect(tag.nextElementSibling).toBe(head.querySelector('.chore-timeline-dates'));
    const weeks = [...head.querySelectorAll('.chore-timeline-dates > .chore-timeline-week')];
    expect(weeks.map((w) => w.textContent)).toEqual(['2 Nov', '9 Nov', '16 Nov']);
    expect(parseFloat(weeks[0].style.left)).toBeCloseTo((6 / 21) * 100, 3);
    const days = [...track.querySelectorAll('.chore-timeline-grid > .chore-timeline-day')];
    expect(days).toHaveLength(21);
    expect(days.filter((d) => d.classList.contains('chore-timeline-day--week'))).toHaveLength(3);
    expect(days[6]).toHaveClass('chore-timeline-day--week');
    expect(parseFloat(days[6].style.left)).toBeCloseTo((6 / 21) * 100, 3);
    const now = track.querySelector('.chore-timeline-grid > .chore-timeline-now');
    expect(now.textContent).toBe('');
    expect(parseFloat(now.style.left)).toBeCloseTo((4.5 / 21) * 100, 3);
});

it('gives each row a titled label and a lane holding the bar and tail', () => {
    const { container } = renderIt([late]);
    const row = container.querySelector('button.chore-timeline-row');
    const label = row.querySelector('.chore-timeline-label');
    expect(label).toHaveAttribute('title', 'Mop');
    const lane = row.querySelector('.chore-timeline-lane');
    expect(lane.querySelector('.chore-timeline-bar')).not.toBeNull();
    expect(lane.querySelector('.chore-timeline-tail')).not.toBeNull();
});

it('shows an empty prompt before the never-done line when nothing is dated', () => {
    const { container } = renderIt([never]);
    const empty = container.querySelector('p.chore-timeline-empty');
    expect(empty.textContent).toBe('Mark a chore done to start its schedule');
    expect(empty.nextElementSibling).toBe(container.querySelector('p.chore-timeline-never'));
});

it('shows the never-done count only when positive, even with no scroller', () => {
    const { container, rerender } = renderIt([open]);
    expect(container.querySelector('.chore-timeline-never')).toBeNull();
    rerender(<ChoreTimeline chores={[never, { ...never, id: 6, name: 'Attic' }]} today={today} onSelect={jest.fn()} />);
    expect(container.querySelector('p.chore-timeline-never').textContent).toBe('2 never done');
    expect(container.querySelector('.chore-timeline-scroll')).toBeNull();
});

it('calls onSelect with the chore when its row is clicked', () => {
    const onSelect = jest.fn();
    renderIt([late, open], onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'Dust' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(open);
});
