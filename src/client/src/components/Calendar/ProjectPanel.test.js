import React, { useState } from 'react';
import { isInaccessible, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProjectPanel from './ProjectPanel';
import PanelTodoRow from './PanelTodoRow';
import { POOL_STATUS } from '../../hooks/usePool';
import { loadStylesheets } from '../../testUtils/stylesheet';

const todo = (todoId, text) => ({
    todoId,
    text,
    status: 'incomplete',
    isPinned: true,
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 9,
    sequenceTitle: 'Session handling',
});

const pool = {
    status: POOL_STATUS.ready,
    loadError: '',
    reload: jest.fn(),
    projects: [
        { id: 2, title: 'Auth rewrite', todos: [todo(12, 'Refresh tokens'), todo(13, 'Rotate keys')] },
        { id: 3, title: 'Quiet project', todos: [] },
    ],
};

// Which cards are open lives above the panel — the page holds it so a retry that
// remounts the panel does not fold every card. The tests stand in for the page.
const PanelHost = (props) => {
    const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());

    const toggleProject = (projectId) =>
        setExpandedProjectIds((open) => new Set(
            open.has(projectId) ? [...open].filter((id) => id !== projectId) : [...open, projectId]
        ));

    return (
        <ProjectPanel
            {...props}
            expandedProjectIds={expandedProjectIds}
            onToggleProject={toggleProject}
        />
    );
};

const renderPanel = (scheduled = []) =>
    render(<PanelHost pool={pool} scheduledByTodoId={new Map(scheduled)} />);

describe('ProjectPanel', () => {
    test.each([
        ['incomplete', null, 'Pinned.'],
        ['blocked', null, 'Pinned. Blocked.'],
        ['complete', null, 'Pinned. Complete.'],
        ['incomplete', { dayIndex: 0 }, 'Pinned.'],
        ['blocked', { dayIndex: 0 }, 'Pinned. Blocked.'],
        ['complete', { dayIndex: 0 }, 'Pinned. Complete.'],
    ])('exposes status text for a %s pin with booking %j', (status, scheduled, expected) => {
        render(<ul><PanelTodoRow
            todo={{ ...todo(12, 'Status pin'), status }}
            scheduled={scheduled}
        /></ul>);

        const row = screen.getByRole('listitem');
        const statusText = screen.getByText(expected);
        expect(statusText).toHaveClass('calendar-sr-only');
        expect(isInaccessible(statusText)).toBe(false);
        expect(row).not.toHaveAttribute('aria-label');
        expect(row.textContent.split('Status pin')).toHaveLength(2);
        expect(row.querySelector('.calendar-pin-icon')).toHaveAttribute('aria-hidden', 'true');
        expect(row.querySelector('.panel-todo-grip')).toBeNull();
    });

    test('complete scheduled pins remain crossed out with their Day badge and icon', async () => {
        const unload = loadStylesheets('Calendar.css');
        try {
            render(<PanelHost
                pool={{ ...pool, projects: [{ id: 2, title: 'Auth rewrite', todos: [
                    { ...todo(12, 'Done pin'), status: 'complete' },
                ] }] }}
                scheduledByTodoId={new Map([[12, { dayIndex: 1 }]])}
            />);
            await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

            const text = screen.getByText('Done pin');
            expect(getComputedStyle(text).textDecoration).toBe('line-through');
            expect(text.closest('li')).toHaveTextContent('Day 2');
            expect(text.closest('li').querySelector('.calendar-pin-icon')).toBeInTheDocument();
        } finally {
            unload();
        }
    });

    test.each([
        ['complete', true, false],
        ['blocked', true, true],
        ['blocked', false, false],
    ])('an unscheduled %s pin with drag permission %s has effective drag capability %s', async (status, isDraggable, canDrag) => {
        render(<PanelHost
            pool={{ ...pool, projects: [{ id: 2, title: 'Auth rewrite', todos: [
                { ...todo(12, 'Status pin'), status },
            ] }] }}
            scheduledByTodoId={new Map()}
            dragFor={() => isDraggable}
        />);

        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        const row = screen.getByText('Status pin').closest('li');
        expect(Boolean(row.querySelector('.panel-todo-grip'))).toBe(canDrag);
        expect(Boolean(row.querySelector('[draggable="true"]'))).toBe(canDrag);
        expect(Boolean(row.querySelector('[role="button"]'))).toBe(canDrag);
        expect(Boolean(row.querySelector('[tabindex="0"]'))).toBe(canDrag);
    });

    test('blocked pool rows and bookings use a full danger-token border', () => {
        const unload = loadStylesheets('Calendar.css');
        try {
            const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
            const rule = (selector) => rules.find((entry) => entry.selectorText === selector).style;
            expect(rule('.panel-todo-row').getPropertyValue('border')).toContain('1px solid');
            expect(rule('.panel-todo-row--blocked').getPropertyValue('border-color')).toBe('var(--color-danger)');
            expect(rule('.day-item-card--blocked').getPropertyValue('border')).toBe('1px solid var(--color-danger)');
        } finally {
            unload();
        }
    });

    test('a collapsed card shows the project and its unscheduled count', () => {
        renderPanel();

        expect(screen.getByRole('button', { name: /Auth rewrite/ })).toHaveTextContent('2');
    });

    test('the count leaves out work that is already booked', () => {
        // Arrange — decision 5: the count measures planning progress
        renderPanel([[12, { dayIndex: 0 }]]);

        // Assert
        expect(screen.getByRole('button', { name: /Auth rewrite/ })).toHaveTextContent('1');
    });

    test('there is no count while the calendar has not loaded', async () => {
        // Arrange — `null` means the calendar cannot say where the work went,
        // which is not the same as saying none of it is booked.
        const { container } = render(<PanelHost pool={pool} scheduledByTodoId={null} />);

        // Act — the rows are still listed; only the claim about them is gone.
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        // Assert
        expect(screen.getByText('Refresh tokens')).toBeInTheDocument();
        expect(container.querySelector('.pool-card-count')).not.toBeInTheDocument();
        expect(container.querySelector('.panel-todo-badge')).not.toBeInTheDocument();
    });

    test('a click anywhere on the card expands it', async () => {
        // Arrange
        renderPanel();
        expect(screen.queryByText('Refresh tokens')).not.toBeInTheDocument();

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        // Assert
        expect(screen.getByText('Refresh tokens')).toBeInTheDocument();
        expect(screen.getByText('Rotate keys')).toBeInTheDocument();
    });

    test('clicking again collapses it', async () => {
        // Arrange
        renderPanel();
        const card = screen.getByRole('button', { name: /Auth rewrite/ });
        await userEvent.click(card);

        // Act
        await userEvent.click(card);

        // Assert
        expect(screen.queryByText('Refresh tokens')).not.toBeInTheDocument();
    });

    test('a scheduled row is shown with its day and is not draggable', async () => {
        // Arrange — decision 4
        renderPanel([[12, { dayIndex: 0 }]]);

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        // Assert
        const row = screen.getByText('Refresh tokens').closest('.panel-todo-row');
        expect(row).toHaveClass('panel-todo-row--scheduled');
        expect(row).toHaveTextContent('Day 1');
        expect(row.querySelector('[draggable="true"]')).toBeNull();
    });

    test('a project with no pins says so rather than vanishing', async () => {
        // Arrange
        renderPanel();

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Quiet project/ }));

        // Assert
        expect(screen.getByText('No pinned to-dos yet.')).toBeInTheDocument();
    });

    test('a failed pool load offers a retry inside the panel', () => {
        // Arrange + Act
        render(
            <PanelHost
                pool={{ ...pool, status: POOL_STATUS.error, loadError: 'Offline', projects: [] }}
                scheduledByTodoId={new Map()}
            />
        );

        // Assert
        expect(screen.getByText('Offline')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
});
