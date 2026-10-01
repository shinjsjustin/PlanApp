import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import CalendarDragArea from './CalendarDragArea';
import { CalendarProvider } from '../../state/CalendarContext';
import { POOL_STATUS } from '../../hooks/usePool';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { isTempId } from '../../lib/tempIds';
import { itemKeyOf } from '../../lib/schedule';

const { dayHeightPx: DAY_HEIGHT_PX, minutesToPx } = createDayGeometry(PX_PER_SLOT_MIN);

// Both gestures driven for real, against the one rule they share: nothing may be
// committed against a day the *saved* schedule does not contain. A day the
// server has not acknowledged yet and a day that exists only in this frame's
// preview are the same thing to `spillFrom` and `toBulkRequest` — both throw —
// and both throws would leave an event handler, where no error boundary catches
// them and the gesture dies with nothing on screen.
//
// jsdom lays nothing out, so the rects below are supplied by hand. Nothing here
// asserts a coordinate; they are the floor dnd-kit's collision detection and the
// edge arithmetic need before their own logic can run at all.

const COLUMN_WIDTH_PX = 220;
const COLUMN_PITCH_PX = 240;

// jsdom ships no `PointerEvent`, so `fireEvent.pointerDown` would build a bare
// `Event` carrying none of the coordinates either gesture reads — and dnd-kit's
// sensor refuses a press that is not `isPrimary`. `MouseEvent` supplies the
// coordinates; the pointer fields go on top.
class TestPointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
        super(type, init);

        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
    }
}

window.PointerEvent = TestPointerEvent;

const makeRect = (left, top, width, height) => {
    const rect = {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
    };

    rect.toJSON = () => rect;

    return rect;
};

const columnIndexOf = (node) =>
    Array.from(document.querySelectorAll('.day-column-drop')).indexOf(node);

/**
 * The strip as a browser would lay it out: columns side by side, a card where
 * its own inline style already says it is.
 *
 * Patched on the prototype rather than on the nodes, because the column under
 * test is the one the spill *appends mid-gesture* — it does not exist when the
 * drag starts, and dnd-kit measures it the moment it registers.
 *
 * The drag ghost is measured too, and it is the rect the drop is read off:
 * dnd-kit collides against the overlay's rect when one is mounted, not the
 * card's. The ghost sits at the top left of the wrapper dnd-kit positions at the
 * lifted card, so reading that wrapper's own inline box back is what a browser
 * would have returned.
 */
const layOutStrip = () => {
    Element.prototype.getBoundingClientRect = function getRect() {
        if (this.classList.contains('day-column-drop')) {
            return makeRect(columnIndexOf(this) * COLUMN_PITCH_PX, 0, COLUMN_WIDTH_PX, DAY_HEIGHT_PX);
        }

        if (this.classList.contains('day-item-card')) {
            const column = this.closest('.day-column-drop');

            return makeRect(
                columnIndexOf(column) * COLUMN_PITCH_PX,
                parseFloat(this.style.top),
                COLUMN_WIDTH_PX,
                parseFloat(this.style.height)
            );
        }

        if (this.classList.contains('remove-overlay')) {
            return makeRect(900, 0, 200, DAY_HEIGHT_PX);
        }

        if (this.classList.contains('calendar-drag-ghost')) {
            const wrapper = this.parentElement;

            return makeRect(
                parseFloat(wrapper.style.left),
                parseFloat(wrapper.style.top),
                parseFloat(wrapper.style.width),
                parseFloat(wrapper.style.height)
            );
        }

        return makeRect(0, 0, 0, 0);
    };
};


const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const todoBooking = (todoId, dayId, startMinutes) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes: 60,
    text: 'Fit the rotor',
    status: 'incomplete',
    projectId: 3,
    sequenceId: null,
});

const sequenceBooking = (sequenceId, dayId, startMinutes) => ({
    kind: 'sequence',
    sequenceId,
    todoId: null,
    dayId,
    startMinutes,
    durationMinutes: 60,
    text: 'Launch',
    status: null,
    projectId: 3,
});

const poolSequence = (sequenceId) => ({
    kind: 'sequence',
    sequenceId,
    todoId: null,
    text: 'Launch',
    title: 'Launch',
    description: 'Ship it',
    isBlocked: false,
    isPinned: true,
    projectId: 3,
    projectTitle: 'Auth',
    todos: [{ id: 1, text: 'first step', status: 'incomplete', isPinned: false, position: 0 }],
});

const poolFor = (sequences) => ({
    status: POOL_STATUS.ready,
    projects: [{ id: 3, title: 'Auth', todos: [], sequences }],
    refreshError: '',
    loadError: '',
    reload: () => {},
});

const NOTES = {
    state: { loadError: null },
    reload: () => {},
    notesForDay: () => [],
    createNote: () => {},
    updateNote: () => {},
    deleteNote: () => {},
};

const renderArea = (state, { pool = poolFor([]), onOpenSource = () => {} } = {}) => {
    const commit = jest.fn();
    const unschedule = jest.fn();

    render(
        <CalendarProvider
            value={{
                state,
                commit,
                unschedule,
                completeTodo: jest.fn(),
                addDay: jest.fn(),
                deleteDay: jest.fn(),
                isUnsavedDay: (dayId) => isTempId(dayId),
                hasUnsavedDay: false,
            }}
        >
            <CalendarDragArea
                pool={pool}
                notes={NOTES}
                onOpenSource={onOpenSource}
                expandedProjectIds={new Set([3])}
                onToggleProject={() => {}}
            />
        </CalendarProvider>
    );

    return { commit, unschedule };
};

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const pointerMoveTo = async (x, y) => {
    fireEvent.pointerMove(document, { clientX: x, clientY: y });
    await settle();
};

/** Lifts `handle` and releases it at (x, y), the way a real drag would. */
const dragTo = async (handle, from, to) => {
    fireEvent.pointerDown(handle, { clientX: from.x, clientY: from.y });
    await pointerMoveTo(from.x, from.y + 10);
    await pointerMoveTo(to.x, to.y);
    await pointerMoveTo(to.x + 1, to.y);
    fireEvent.pointerUp(document, { clientX: to.x + 1, clientY: to.y });
    await settle();
};

const originalGetRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
    layOutStrip();
});

afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetRect;
});

const state = () => ({
    days: [day(1, 0), day(2, 1)],
    items: [todoBooking(5, 1, 540), sequenceBooking(5, 1, 720)],
});

describe('a sequence booking renders', () => {
    // First in the file: dnd-kit swallows the first click after any drag ends.
    test('is bold, has no complete bubble and opens its source from the name', () => {
        const onOpenSource = jest.fn();
        renderArea(state(), { onOpenSource });

        const card = screen.getByRole('button', { name: 'Launch' }).closest('.day-item-card');
        expect(card).toHaveClass('day-item-card--sequence');
        expect(card.querySelector('.day-item-bubble')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
        expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ sequenceId: 5, kind: 'sequence' }));
    });
});

describe('a pool sequence dropped on a day', () => {
    test('books for the default hour beside a to-do with the same id', async () => {
        const { commit } = renderArea(
            { days: [day(1, 0)], items: [todoBooking(5, 1, 540)] },
            { pool: poolFor([poolSequence(5)]) }
        );
        const grip = document.querySelector('.panel-sequence-row .panel-todo-grip');

        await dragTo(grip, { x: 500, y: 300 }, { x: 100, y: 300 + minutesToPx(600) });

        expect(commit).toHaveBeenCalledTimes(1);
        const items = commit.mock.calls[0][0].items;
        expect(items.map(itemKeyOf).sort()).toEqual(['sequence:5', 'todo:5']);
        expect(items.find((item) => item.kind === 'sequence')).toEqual(
            expect.objectContaining({ sequenceId: 5, dayId: 1, durationMinutes: 60 })
        );
    });

    test('is not draggable once that sequence is booked, though a to-do with its id is free', () => {
        renderArea(
            { days: [day(1, 0)], items: [sequenceBooking(5, 1, 540)] },
            { pool: poolFor([poolSequence(5)]) }
        );

        expect(document.querySelector('.panel-sequence-row .panel-todo-grip')).toBeNull();
        expect(document.querySelector('.panel-sequence-row .panel-todo-badge')).toHaveTextContent('Day 1');
    });
});

describe('a sequence booking in the grid', () => {
    test('moves alone', async () => {
        const { commit } = renderArea(state());
        const handle = screen.getByRole('button', { name: 'Move “Launch”' });
        const fromY = 200;

        await dragTo(
            handle,
            { x: 100, y: fromY },
            { x: COLUMN_PITCH_PX + 100, y: fromY + minutesToPx(780) - minutesToPx(720) }
        );

        const items = commit.mock.calls[0][0].items;
        expect(items.find((item) => item.kind === 'sequence')).toEqual(
            expect.objectContaining({ dayId: 2, startMinutes: 780 })
        );
        expect(items.find((item) => item.kind !== 'sequence')).toEqual(
            expect.objectContaining({ todoId: 5, dayId: 1, startMinutes: 540 })
        );
    });

    test('resizes alone', async () => {
        const { commit } = renderArea(state());
        const edge = screen.getByRole('separator', { name: 'Change how long “Launch” takes' });

        fireEvent.pointerDown(edge, { clientX: 100, clientY: 400 });
        await settle();
        fireEvent.pointerMove(document, { clientX: 100, clientY: 400 + minutesToPx(60) });
        fireEvent.pointerUp(document, { clientX: 100, clientY: 400 + minutesToPx(60) });
        await settle();

        const items = commit.mock.calls[0][0].items;
        expect(items.find((item) => item.kind === 'sequence').durationMinutes).toBe(120);
        expect(items.find((item) => item.kind !== 'sequence').durationMinutes).toBe(60);
    });

    test('is released by its key when dropped on the remove overlay', async () => {
        const { unschedule } = renderArea(state());
        const handle = screen.getByRole('button', { name: 'Move “Launch”' });

        await dragTo(handle, { x: 100, y: 200 }, { x: 1000, y: 200 });

        expect(unschedule).toHaveBeenCalledTimes(1);
        expect(unschedule).toHaveBeenCalledWith('sequence:5');
    });

    describe('hovering', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('shows the pool sequence after 400 ms, and not before', () => {
            renderArea(state(), { pool: poolFor([poolSequence(5)]) });
            const card = document.querySelector('.day-item-card--sequence');

            fireEvent.mouseEnter(card);
            act(() => jest.advanceTimersByTime(399));
            expect(screen.queryByText('first step')).toBeNull();

            act(() => jest.advanceTimersByTime(1));
            expect(screen.getByText('first step')).toBeInTheDocument();
        });
    });
});
