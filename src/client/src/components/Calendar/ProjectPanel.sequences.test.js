import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';

import ProjectPanel from './ProjectPanel';
import { POOL_STATUS } from '../../hooks/usePool';

const todo = {
    todoId: 12,
    text: 'Refresh tokens',
    status: 'incomplete',
    isPinned: true,
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 9,
    sequenceTitle: 'Session handling',
};

const sequence = (id, title) => ({
    kind: 'sequence',
    sequenceId: id,
    todoId: null,
    text: title,
    title,
    description: 'Ship it',
    isBlocked: false,
    isPinned: true,
    projectId: 2,
    projectTitle: 'Auth rewrite',
    todos: [{ id: 1, text: 'first step', status: 'incomplete', isPinned: false, position: 0 }],
});

const poolWith = (project) => ({
    status: POOL_STATUS.ready,
    loadError: '',
    reload: jest.fn(),
    projects: [{ id: 2, title: 'Auth rewrite', todos: [], sequences: [], ...project }],
});

const renderPanel = (project, props = {}) =>
    render(
        <DndContext>
            <ProjectPanel
                pool={poolWith(project)}
                scheduledByTodoId={new Map()}
                expandedProjectIds={new Set([2])}
                onToggleProject={jest.fn()}
                {...props}
            />
        </DndContext>
    );

describe('ProjectPanel sequences', () => {
    test('lists sequences above to-dos as bold rows with no info line', () => {
        renderPanel({ todos: [todo], sequences: [sequence(5, 'Launch')] });

        const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('panel-todo-row'));
        expect(rows.map((row) => row.textContent)).toEqual([
            expect.stringContaining('Launch'),
            expect.stringContaining('Refresh tokens'),
        ]);
        expect(rows[0]).toHaveClass('panel-todo-row', 'panel-sequence-row');
        expect(rows[0].querySelector('.panel-todo-sequence')).toBeNull();
    });

    test('count includes unscheduled sequences only', () => {
        renderPanel(
            { todos: [todo], sequences: [sequence(5, 'Launch'), sequence(6, 'Wrap')] },
            { scheduledBySequenceId: new Map([[6, { dayIndex: 0 }]]) }
        );
        expect(screen.getByRole('button', { name: /Auth rewrite/ })).toHaveTextContent('2');
    });

    test('empty message shows only when there are neither', () => {
        const { unmount } = renderPanel({ sequences: [sequence(5, 'Launch')] });
        expect(screen.queryByText('No pinned to-dos yet.')).toBeNull();
        unmount();
        renderPanel({});
        expect(screen.getByText('No pinned to-dos yet.')).toBeInTheDocument();
    });

    test('scheduled sequence shows its Day badge and has no grip', () => {
        renderPanel(
            { sequences: [sequence(5, 'Launch')] },
            { scheduledBySequenceId: new Map([[5, { dayIndex: 2 }]]), dragFor: () => true }
        );
        expect(screen.getByText('Day 3')).toBeInTheDocument();
        expect(document.querySelector('.panel-todo-grip')).toBeNull();
    });

    test('unscheduled sequence is draggable only when the page allows it', () => {
        const { unmount } = renderPanel({ sequences: [sequence(5, 'Launch')] });
        expect(document.querySelector('.panel-todo-grip')).toBeNull();
        unmount();
        renderPanel({ sequences: [sequence(5, 'Launch')] }, { dragFor: () => true });
        const grip = document.querySelector('.panel-todo-grip');
        expect(grip).not.toBeNull();
        expect(grip).toHaveAttribute('aria-describedby');
    });

    test.each([
        ['a sequence', 0, 'pool-sequence:5', 'Launch'],
        ['a to-do', 1, 'pool-12', 'Refresh tokens'],
    ])('lifting %s uses its kind-keyed drag id', (_name, gripIndex, id, text) => {
        const onDragStart = jest.fn();
        render(
            <DndContext onDragStart={onDragStart}>
                <ProjectPanel
                    pool={poolWith({ todos: [todo], sequences: [sequence(5, 'Launch')] })}
                    scheduledByTodoId={new Map()}
                    dragFor={() => true}
                    expandedProjectIds={new Set([2])}
                    onToggleProject={jest.fn()}
                />
            </DndContext>
        );

        fireEvent.keyDown(document.querySelectorAll('.panel-todo-grip')[gripIndex], { code: 'Space', key: ' ' });

        const { active } = onDragStart.mock.calls[0][0];
        expect([active.id, active.data.current.poolTodo.text]).toEqual([id, text]);
    });

    test('title is plain text without onOpenSource', () => {
        renderPanel({ sequences: [sequence(5, 'Launch')] });
        expect(screen.queryByRole('button', { name: 'Launch' })).toBeNull();
    });

    test('hovering 400ms shows the preview and its title button opens the source', () => {
        jest.useFakeTimers();
        const onOpenSource = jest.fn();
        const item = sequence(5, 'Launch');
        renderPanel({ sequences: [item] }, { onOpenSource });

        const row = document.querySelector('.panel-sequence-row');
        expect(screen.queryByRole('tooltip')).toBeNull();
        act(() => { userEvent.hover(row); });
        act(() => { jest.advanceTimersByTime(399); });
        expect(screen.queryByRole('tooltip')).toBeNull();
        act(() => { jest.advanceTimersByTime(1); });
        expect(within(screen.getByRole('tooltip')).getByText('first step')).toBeInTheDocument();

        userEvent.click(within(row).getByRole('button', { name: 'Launch' }));
        expect(onOpenSource).toHaveBeenCalledWith(item);
        jest.useRealTimers();
    });
});
