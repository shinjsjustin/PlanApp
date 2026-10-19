import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';

import ProjectPanel from './ProjectPanel';
import { POOL_STATUS } from '../../hooks/usePool';

const TODAY = '2030-05-10';

const poolTodo = {
    id: 12,
    todoId: 12,
    text: 'Refresh tokens',
    status: 'incomplete',
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 5,
    sequenceTitle: 'Launch',
};

const sequence = (id, title, todos = [poolTodo]) => ({
    kind: 'sequence',
    sequenceId: id,
    todoId: null,
    text: title,
    title,
    description: 'Ship it',
    isBlocked: false,
    date: TODAY,
    projectId: 2,
    projectTitle: 'Auth rewrite',
    todos,
});

const poolWith = (...sequences) => ({
    status: POOL_STATUS.ready,
    loadError: '',
    refreshError: '',
    reload: jest.fn(),
    days: [{ date: TODAY, sequences }],
});

const renderPanel = (sequences, props = {}) =>
    render(
        <DndContext>
            <ProjectPanel
                pool={poolWith(...sequences)}
                scheduledByTodoId={new Map()}
                today={TODAY}
                {...props}
            />
        </DndContext>
    );

describe('ProjectPanel sequences', () => {
    test('a sequence is one bold block with no pin or info line', () => {
        renderPanel([sequence(5, 'Launch')]);

        const block = screen.getByText('Launch').closest('.panel-sequence-row');
        expect(block).toHaveClass('panel-todo-row', 'panel-sequence-row');
        expect(block.querySelector('.panel-todo-sequence')).toBeNull();
        expect(document.querySelector('.calendar-pin-icon')).toBeNull();
    });

    test('a booked sequence shows its Day badge and has no grip of its own', () => {
        renderPanel([sequence(5, 'Launch', [])], {
            scheduledBySequenceId: new Map([[5, { dayIndex: 2 }]]),
            dragFor: () => true,
        });

        expect(screen.getByText('Day 3')).toBeInTheDocument();
        expect(document.querySelector('.panel-todo-grip')).toBeNull();
    });

    test('an unscheduled sequence is draggable only when the page allows it', () => {
        const { unmount } = renderPanel([sequence(5, 'Launch', [])]);
        expect(document.querySelector('.panel-todo-grip')).toBeNull();
        unmount();
        renderPanel([sequence(5, 'Launch', [])], { dragFor: () => true });
        const grip = document.querySelector('.panel-todo-grip');
        expect(grip).not.toBeNull();
        expect(grip).toHaveAttribute('aria-describedby');
    });

    test.each([
        ['a sequence', 0, 'pool-sequence:5', 'Launch'],
        ['a to-do inside it', 1, 'pool-12', 'Refresh tokens'],
    ])('lifting %s uses its kind-keyed drag id', (_name, gripIndex, id, text) => {
        const onDragStart = jest.fn();
        render(
            <DndContext onDragStart={onDragStart}>
                <ProjectPanel
                    pool={poolWith(sequence(5, 'Launch'))}
                    scheduledByTodoId={new Map()}
                    dragFor={() => true}
                    today={TODAY}
                />
            </DndContext>
        );

        fireEvent.keyDown(document.querySelectorAll('.panel-todo-grip')[gripIndex], { code: 'Space', key: ' ' });

        const { active } = onDragStart.mock.calls[0][0];
        expect([active.id, active.data.current.poolTodo.text]).toEqual([id, text]);
    });

    test('title is plain text without onOpenSource, a button that opens the source with it', async () => {
        const item = sequence(5, 'Launch');
        const { unmount } = renderPanel([item]);
        expect(screen.queryByRole('button', { name: 'Launch' })).toBeNull();
        unmount();

        const onOpenSource = jest.fn();
        renderPanel([item], { onOpenSource });
        await userEvent.click(screen.getByRole('button', { name: 'Launch' }));
        expect(onOpenSource).toHaveBeenCalledWith(item);
    });

    test('hovering a block shows no preview, since its to-dos are already visible', () => {
        jest.useFakeTimers();
        renderPanel([sequence(5, 'Launch')]);
        userEvent.hover(document.querySelector('.panel-sequence-row'));
        jest.advanceTimersByTime(1000);
        jest.useRealTimers();

        expect(screen.queryByRole('tooltip')).toBeNull();
    });
});
