import React from 'react';
import { isInaccessible, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProjectPanel from './ProjectPanel';
import PanelTodoRow from './PanelTodoRow';
import { POOL_STATUS } from '../../hooks/usePool';
import { dayLabel } from '../../lib/dates';
import { loadStylesheets } from '../../testUtils/stylesheet';

const TODAY = '2030-05-10';

const todo = (todoId, text, status = 'incomplete') => ({
    id: todoId,
    todoId,
    text,
    status,
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 9,
    sequenceTitle: 'Session handling',
});

const sequence = (id, title, date, todos = []) => ({
    kind: 'sequence',
    sequenceId: id,
    todoId: null,
    text: title,
    title,
    date,
    projectId: 2,
    projectTitle: 'Auth rewrite',
    todos,
});

const poolOf = (days, extra = {}) => ({
    status: POOL_STATUS.ready,
    loadError: '',
    refreshError: '',
    reload: jest.fn(),
    days,
    ...extra,
});

const twoDays = poolOf([
    { date: TODAY, sequences: [sequence(5, 'Launch', TODAY, [todo(12, 'Refresh tokens'), todo(13, 'Rotate keys')])] },
    { date: '2030-05-12', sequences: [sequence(6, 'Wrap', '2030-05-12')] },
]);

const renderPanel = (props = {}) =>
    render(<ProjectPanel pool={twoDays} scheduledByTodoId={new Map()} today={TODAY} {...props} />);

describe('ProjectPanel', () => {
    test('heads today as Today and later days with their label, one group per day', () => {
        renderPanel();

        const headings = screen.getAllByRole('heading').map((h) => h.textContent);
        expect(headings).toEqual(['Today', dayLabel('2030-05-12')]);
    });

    test('an empty pool says no dated sequences are ahead', () => {
        renderPanel({ pool: poolOf([]) });

        expect(screen.getByText('No dated sequences ahead.')).toBeInTheDocument();
    });

    test('nests each sequence\'s to-dos inside its block', () => {
        renderPanel();

        const block = screen.getByText('Launch').closest('.panel-sequence-row');
        expect(block).toContainElement(screen.getByText('Refresh tokens'));
        expect(block).toContainElement(screen.getByText('Rotate keys'));
        expect(screen.getByText('Wrap').closest('.panel-sequence-row')).not.toContainElement(
            screen.getByText('Rotate keys')
        );
    });

    test('a booked to-do shows its own Day badge and no grip; its siblings are unaffected', () => {
        renderPanel({
            scheduledByTodoId: new Map([[12, { dayIndex: 0 }]]),
            dragFor: () => true,
        });

        const booked = screen.getByText('Refresh tokens').closest('.panel-todo-row');
        expect(booked).toHaveClass('panel-todo-row--scheduled');
        expect(booked).toHaveTextContent('Day 1');
        expect(booked.querySelector('.panel-todo-grip')).toBeNull();
        const free = screen.getByText('Rotate keys').closest('.panel-todo-row');
        expect(free.querySelector('.panel-todo-grip')).not.toBeNull();
        expect(free).not.toHaveTextContent('Day');
    });

    test('no Day badge appears while the calendar has not loaded', () => {
        const { container } = renderPanel({ scheduledByTodoId: null });

        expect(screen.getByText('Refresh tokens')).toBeInTheDocument();
        expect(container.querySelector('.panel-todo-badge')).toBeNull();
    });

    test.each([
        ['blocked', 'Blocked.'],
        ['complete', 'Complete.'],
    ])('exposes status text for a %s to-do', (status, expected) => {
        render(<ul><PanelTodoRow todo={todo(12, 'Status row', status)} /></ul>);

        const row = screen.getByRole('listitem');
        const statusText = screen.getByText(expected);
        expect(statusText).toHaveClass('calendar-sr-only');
        expect(isInaccessible(statusText)).toBe(false);
        expect(row.querySelector('.calendar-pin-icon')).toBeNull();
        expect(row).not.toHaveTextContent('Pinned.');
    });

    test('a to-do row no longer names its sequence', () => {
        render(<ul><PanelTodoRow todo={todo(12, 'Row')} /></ul>);

        expect(screen.queryByText('Session handling')).toBeNull();
    });

    test.each([
        ['complete', true, false],
        ['blocked', true, true],
        ['blocked', false, false],
        ['incomplete', true, true],
    ])('an unscheduled %s to-do with drag permission %s has drag capability %s', (status, isDraggable, canDrag) => {
        renderPanel({
            pool: poolOf([{ date: TODAY, sequences: [sequence(5, 'Launch', TODAY, [todo(12, 'Row', status)])] }]),
            dragFor: (item) => item.todoId === 12 && isDraggable,
        });

        const row = screen.getByText('Row').closest('li');
        expect(Boolean(row.querySelector('.panel-todo-grip'))).toBe(canDrag);
        expect(Boolean(row.querySelector('[draggable="true"]'))).toBe(canDrag);
    });

    test('complete scheduled to-dos remain crossed out with their Day badge', () => {
        const unload = loadStylesheets('Calendar.css');
        try {
            renderPanel({
                pool: poolOf([{ date: TODAY, sequences: [sequence(5, 'Launch', TODAY, [todo(12, 'Done', 'complete')])] }]),
                scheduledByTodoId: new Map([[12, { dayIndex: 1 }]]),
            });

            const text = screen.getByText('Done');
            expect(getComputedStyle(text).textDecoration).toBe('line-through');
            expect(text.closest('li')).toHaveTextContent('Day 2');
        } finally {
            unload();
        }
    });

    test('blocked pool rows and bookings use a full danger-token border', () => {
        const unload = loadStylesheets('Calendar.css');
        try {
            const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
            const rule = (selector) => rules.find((entry) => entry.selectorText === selector).style;
            expect(rule('.panel-todo-row').getPropertyValue('border')).toContain('1px solid');
            expect(rule('.panel-todo-row--blocked').getPropertyValue('border-color')).toBe('var(--color-danger)');
            expect(rule('.day-item-card--blocked').getPropertyValue('border')).toBe('1px solid var(--color-danger)');
            expect(rules.some((entry) => entry.selectorText === '.calendar-pin-icon')).toBe(false);
        } finally {
            unload();
        }
    });

    test('a failed pool load offers a retry inside the panel', async () => {
        const reload = jest.fn();
        renderPanel({ pool: poolOf([], { status: POOL_STATUS.error, loadError: 'Offline', reload }) });

        expect(screen.getByText('Offline')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(reload).toHaveBeenCalledTimes(1);
    });

    test('a failed re-read keeps the rows and raises the notice', () => {
        renderPanel({ pool: { ...twoDays, refreshError: 'Stale' } });

        expect(screen.getByRole('alert')).toHaveTextContent('Stale');
        expect(screen.getByText('Launch')).toBeInTheDocument();
    });
});
