import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProjectPanel from './ProjectPanel';
import { POOL_STATUS } from '../../hooks/usePool';

const todo = (todoId, text) => ({
    todoId,
    text,
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
        setExpandedProjectIds((open) => {
            const next = new Set(open);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });

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

    test('a project with nothing startable says so rather than vanishing', async () => {
        // Arrange
        renderPanel();

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Quiet project/ }));

        // Assert
        expect(screen.getByText(/Nothing startable/)).toBeInTheDocument();
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
