import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import CalendarDragArea from './CalendarDragArea';
import { CalendarProvider } from '../../state/CalendarContext';
import { POOL_STATUS } from '../../hooks/usePool';
import { DAY_HEIGHT_PX, minutesToPx } from '../../lib/scheduleGeometry';
import { isTempId } from '../../lib/tempIds';

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

const booking = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
    text: 'Fit the rotor',
    status: 'incomplete',
    projectId: 3,
    sequenceId: 9,
});

const POOL = {
    status: POOL_STATUS.ready,
    projects: [],
    refreshError: '',
    loadError: '',
    reload: () => {},
};

const renderArea = (state) => {
    const context = {
        state,
        commit: jest.fn(),
        unschedule: jest.fn(),
        completeTodo: jest.fn(),
        addDay: jest.fn(),
        deleteDay: jest.fn(),
        isUnsavedDay: (dayId) => isTempId(dayId),
        hasUnsavedDay: state.days.some((candidate) => isTempId(candidate.id)),
    };

    render(
        <CalendarProvider value={context}>
            <CalendarDragArea
                pool={POOL}
                onOpenSource={() => {}}
                expandedProjectIds={new Set()}
                onToggleProject={() => {}}
            />
        </CalendarProvider>
    );

    return context;
};

/** dnd-kit measures and re-measures between frames, so each one is flushed. */
const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const pointerMoveTo = async (x, y) => {
    fireEvent.pointerMove(document, { clientX: x, clientY: y });
    await settle();
};

const originalGetRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
    layOutStrip();
});

afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetRect;
});

describe('dropping on a day that only the preview has', () => {
    /**
     * A booking dragged to 23:30 on the last day spills into a day the preview
     * mints as the pointer moves. That column is on screen, so the pointer can
     * reach it — but the schedule every handler settles against has never heard
     * of its id, so a release over it used to throw straight out of `onDragEnd`.
     */
    test('registers no drop and does not throw', async () => {
        // Arrange — one day, one booking at 09:00, so the spill has nowhere to
        // go but a new day.
        const context = renderArea({ days: [day(1, 0)], items: [booking(7, 1, 540)] });
        const handle = screen.getByRole('button', { name: 'Move “Fit the rotor”' });

        // Act — lift, then drag the card's top edge down to 23:30. The sensor
        // has a 5px activation distance, so the lift is its own small move.
        fireEvent.pointerDown(handle, { clientX: 100, clientY: 200 });
        await pointerMoveTo(100, 210);

        const spillY = 200 + minutesToPx(1410) - minutesToPx(540);
        await pointerMoveTo(100, spillY);

        // The preview has appended a column; it is the one being aimed at.
        expect(screen.getAllByRole('region', { name: /^Day \d+$/ })).toHaveLength(2);

        // Sideways onto it, holding the same height so the spill — and so the
        // column — survives the move. dnd-kit reports `over` one frame late, so
        // the pointer sits on the new column for two of them.
        await pointerMoveTo(COLUMN_PITCH_PX + 100, spillY);
        await pointerMoveTo(COLUMN_PITCH_PX + 101, spillY);

        fireEvent.pointerUp(document, { clientX: COLUMN_PITCH_PX + 101, clientY: spillY });
        await settle();

        // Assert — nothing was saved, and the strip is back to the one day the
        // calendar actually has.
        expect(context.commit).not.toHaveBeenCalled();
        expect(screen.getAllByRole('region', { name: /^Day \d+$/ })).toHaveLength(1);
    });

    test('still commits a drop on a day the calendar really has', async () => {
        // Arrange — the same gesture aimed at a saved column, so the guard above
        // is shown to refuse only what it should.
        const context = renderArea({
            days: [day(1, 0), day(2, 1)],
            items: [booking(7, 1, 540)],
        });
        const handle = screen.getByRole('button', { name: 'Move “Fit the rotor”' });

        // Act — lift and carry it into day 2, landing its top edge at 10:00.
        fireEvent.pointerDown(handle, { clientX: 100, clientY: 200 });
        await pointerMoveTo(100, 210);

        const landingY = 200 + minutesToPx(600) - minutesToPx(540);
        await pointerMoveTo(COLUMN_PITCH_PX + 100, landingY);

        fireEvent.pointerUp(document, { clientX: COLUMN_PITCH_PX + 100, clientY: landingY });
        await settle();

        // Assert
        expect(context.commit).toHaveBeenCalledTimes(1);
        expect(context.commit.mock.calls[0][0].items).toEqual([
            expect.objectContaining({ todoId: 7, dayId: 2, startMinutes: 600 }),
        ]);
    });
});

describe('resizing while a day is still saving', () => {
    const dragBottomEdge = async (from, to) => {
        const edge = screen.getByRole('separator', {
            name: 'Change how long “Fit the rotor” takes',
        });

        fireEvent.pointerDown(edge, { clientX: 100, clientY: from });
        await settle();

        fireEvent.pointerMove(document, { clientX: 100, clientY: to });
        fireEvent.pointerUp(document, { clientX: 100, clientY: to });
        await settle();
    };

    /**
     * The window is one PUT wide and a spill opens it: the resize that created
     * the temporary day is committed, and until the server answers, a second
     * edge released inside it would hand `toBulkRequest` a previous state it
     * refuses — from a raw `document` listener, further from a boundary than a
     * drop's throw.
     */
    test('ignores the press and commits nothing', async () => {
        // Arrange — a day the server has not acknowledged sits in the strip.
        const context = renderArea({
            days: [day(1, 0), day(-1, 1)],
            items: [booking(7, 1, 540)],
        });

        // Act — a full bottom-edge drag, one hour down.
        await dragBottomEdge(400, 400 + minutesToPx(60));

        // Assert
        expect(context.commit).not.toHaveBeenCalled();
    });

    test('commits the same drag once every day has a real id', async () => {
        // Arrange — the control: the identical gesture with nothing in flight.
        const context = renderArea({ days: [day(1, 0)], items: [booking(7, 1, 540)] });

        // Act
        await dragBottomEdge(400, 400 + minutesToPx(60));

        // Assert — an hour longer, still starting at 09:00.
        expect(context.commit).toHaveBeenCalledTimes(1);
        expect(context.commit.mock.calls[0][0].items).toEqual([
            expect.objectContaining({ todoId: 7, startMinutes: 540, durationMinutes: 120 }),
        ]);
    });
});
