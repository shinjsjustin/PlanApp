import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NotePlane from './NotePlane';
import { MAX_NOTE_LANES } from '../../lib/noteLanes';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { DayScaleProvider } from '../../state/DayScaleContext';
import { containingBlockOf, loadStylesheets } from '../../testUtils/stylesheet';

const note = (id, overrides = {}) => ({
    id,
    dayId: 1,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const renderPlane = (props = {}) =>
    render(
        <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
            <NotePlane dayId={1} notes={[]} {...props} />
        </DayScaleProvider>
    );

/**
 * A day whose id matches no note id, and notes whose ids match no `dayId`.
 *
 * The factory above numbers a note 1 and puts it on day 1, so a plane that read
 * the wrong field off a note — or addressed the wrong one of the two ids — would
 * still answer correctly. Everything below that could confuse the two uses these
 * instead.
 */
const OTHER_DAY_ID = 7;

const onOtherDay = (id, overrides = {}) => note(id, { dayId: OTHER_DAY_ID, ...overrides });

describe('NotePlane', () => {
    test('draws every note it is given', () => {
        // Act
        renderPlane({ notes: [note(1), note(2, { startMinutes: 700 })] });

        // Assert
        expect(screen.getByText('note 1')).toBeInTheDocument();
        expect(screen.getByText('note 2')).toBeInTheDocument();
    });

    test('puts a lone note in lane 0', () => {
        // Act
        const { container } = renderPlane({ notes: [note(1)] });

        // Assert
        expect(container.querySelector('.note-ribbon')).toHaveStyle({ right: '0%' });
    });

    test('steps overlapping notes leftward', () => {
        // Arrange — two notes covering the same hour
        const notes = [note(1), note(2)];

        // Act
        const { container } = renderPlane({ notes });

        // Assert
        const ribbons = [...container.querySelectorAll('.note-ribbon')];
        expect(ribbons.map((ribbon) => ribbon.style.right)).toEqual(['0%', '25%']);
    });

    test('re-lanes its notes when the day’s notes change', () => {
        // Arrange — one note, alone in lane 0
        const { container, rerender } = renderPlane({
            dayId: OTHER_DAY_ID,
            notes: [onOtherDay(1)],
        });
        const rightsNow = () =>
            [...container.querySelectorAll('.note-ribbon')].map((ribbon) => ribbon.style.right);

        expect(rightsNow()).toEqual(['0%']);

        // Act — a second note arrives over the same hour, so the first no longer
        // has the plane to itself
        rerender(
            <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
                <NotePlane
                    dayId={OTHER_DAY_ID}
                    notes={[onOtherDay(1), onOtherDay(2)]}
                />
            </DayScaleProvider>
        );

        // Assert — lanes held over from the previous render would leave the new
        // note unplaced and drawn on top of the old one.
        expect(rightsNow()).toEqual(['0%', '25%']);
    });

    test('re-lanes when a note moves, though the count has not changed', () => {
        // Arrange — two notes over the same hour, so they are in lanes 0 and 1
        const { container, rerender } = renderPlane({
            dayId: OTHER_DAY_ID,
            notes: [onOtherDay(1), onOtherDay(2)],
        });
        const rightsNow = () =>
            [...container.querySelectorAll('.note-ribbon')].map((ribbon) => ribbon.style.right);

        expect(rightsNow()).toEqual(['0%', '25%']);

        // Act — one is dragged clear of the other. Nothing is added or removed,
        // which is what a move always looks like: watching the count rather than
        // the notes themselves would see no change at all here.
        rerender(
            <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
                <NotePlane
                    dayId={OTHER_DAY_ID}
                    notes={[onOtherDay(1), onOtherDay(2, { startMinutes: 700 })]}
                />
            </DayScaleProvider>
        );

        // Assert — neither note overlaps anything now, so both sit against the
        // boundary
        expect(rightsNow()).toEqual(['0%', '0%']);
    });

    test('keeps a ribbon with its note when the notes reorder', () => {
        // Arrange — two notes, the later one second
        const early = onOtherDay(1, { startMinutes: 540 });
        const late = onOtherDay(2, { startMinutes: 600 });
        const { container, rerender } = renderPlane({
            dayId: OTHER_DAY_ID,
            notes: [early, late],
        });
        const firstRibbon = container.querySelector('.note-ribbon');

        // Act — a move drags the second note earlier, so the array reorders.
        // Keyed by position rather than by note, React would reuse the first
        // ribbon's DOM node for a different note and remount the other — which
        // mid-drag means the node under the pointer is swapped out from under it.
        const moved = { ...late, startMinutes: 480 };
        rerender(
            <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
                <NotePlane dayId={OTHER_DAY_ID} notes={[moved, early]} />
            </DayScaleProvider>
        );

        // Assert — note 1's ribbon is the same element it was
        const ribbons = [...container.querySelectorAll('.note-ribbon')];
        const stillEarly = ribbons.find((ribbon) => ribbon.textContent === 'note 1');
        expect(stillEarly).toBe(firstRibbon);
    });

    test('is labelled for the day it belongs to', () => {
        // Act
        renderPlane({ label: 'Notes for Day 1' });

        // Assert
        expect(screen.getByRole('group', { name: 'Notes for Day 1' })).toBeInTheDocument();
    });

    test('still has a name when nobody gives it one', () => {
        // Act — a plane rendered bare, as a test or a bare column renders it
        renderPlane();

        // Assert — an unnamed group is a landmark a screen reader can enter and
        // not be told what it has entered.
        expect(screen.getByRole('group', { name: 'Notes' })).toBeInTheDocument();
    });

    test('hands the render over when a caller takes it', () => {
        // Arrange — the wrapper that owns the gestures supplies its own ribbons
        const ribbonFor = (aNote, lane) => (
            <div key={aNote.id} data-testid="custom">{`${aNote.text} @ ${lane}`}</div>
        );

        // Act — on a day whose id is nothing like the note's, because this is
        // the branch production takes once the drag wrapper supplies a wired
        // plane, and a lane looked up by the wrong id would reach every ribbon
        // on the page.
        renderPlane({ dayId: OTHER_DAY_ID, notes: [onOtherDay(1)], ribbonFor });

        // Assert
        expect(screen.getByTestId('custom')).toHaveTextContent('note 1 @ 0');
    });

    test('renders a draft ghost when one is in flight', () => {
        // Arrange
        const draft = { startMinutes: 600, durationMinutes: 30, isAllowed: true };

        // Act
        const { container } = renderPlane({ draft });

        // Assert
        expect(container.querySelector('.note-draft')).toBeInTheDocument();
        expect(container.querySelector('.note-draft--refused')).not.toBeInTheDocument();
    });

    test('marks a draft that cannot be placed', () => {
        // Arrange
        const draft = { startMinutes: 600, durationMinutes: 30, isAllowed: false };

        // Act
        const { container } = renderPlane({ draft });

        // Assert
        expect(container.querySelector('.note-draft--refused')).toBeInTheDocument();
    });

    test('lays the draft over the minutes it covers, at the day’s scale', () => {
        // Arrange — a scale other than the floor, so a plane that positioned the
        // draft from raw minutes, or from a geometry of its own, cannot agree
        // with the day around it by coincidence.
        const geometry = createDayGeometry(PX_PER_SLOT_MIN * 2);
        const draft = { startMinutes: 600, durationMinutes: 90, isAllowed: true };

        // Act
        const { container } = render(
            <DayScaleProvider value={geometry}>
                <NotePlane dayId={OTHER_DAY_ID} notes={[]} draft={draft} />
            </DayScaleProvider>
        );

        // Assert
        expect(container.querySelector('.note-draft')).toHaveStyle({
            top: `${geometry.minutesToPx(600)}px`,
            height: `${geometry.minutesToPx(90)}px`,
        });
    });

    test('draws the create surface behind every ribbon', () => {
        // Arrange + Act — a press that lands on a note must reach the note, so
        // the surface has to be underneath: earlier in the plane, not later.
        const { container } = renderPlane({ notes: [onOtherDay(1)] });

        // Assert
        const children = [...container.querySelector('.note-plane').children];
        const surface = container.querySelector('.note-plane-surface');
        const ribbon = container.querySelector('.note-ribbon');

        expect(surface).toBeInTheDocument();
        expect(children.indexOf(surface)).toBeLessThan(children.indexOf(ribbon));
    });

    test('hands the create gesture its surface to listen on', () => {
        // Arrange
        const onPointerDown = jest.fn();

        // Act
        const { container } = renderPlane({ surfaceProps: { onPointerDown } });
        fireEvent.pointerDown(container.querySelector('.note-plane-surface'));

        // Assert
        expect(onPointerDown).toHaveBeenCalled();
    });

    test('registers itself as the notes drop target', () => {
        // Arrange
        const setNodeRef = jest.fn();

        // Act — the classes the drag wrapper really passes: its own base plus a
        // hover modifier, which the plane appends to `note-plane` rather than
        // being replaced by.
        const { container } = renderPlane({
            droppable: { setNodeRef, className: 'note-plane-drop note-plane-drop--over' },
        });

        // Assert — dnd-kit measures the node it is handed, so it must be the
        // plane itself and not some inner box.
        const plane = container.querySelector('.note-plane');
        expect(setNodeRef).toHaveBeenCalledWith(plane);
        expect(plane).toHaveClass('note-plane', 'note-plane-drop', 'note-plane-drop--over');
    });

    test('carries no droppable class when nothing is dropping on it', () => {
        // Act
        const { container } = renderPlane();

        // Assert
        expect(container.querySelector('.note-plane').className).toBe('note-plane');
    });

    test('adds nothing when a droppable has no class to add', () => {
        // Arrange — a wrapper may want only the node ref. Interpolating an
        // absent class would put the word "undefined" in the class list, where
        // it reads like a rule somebody forgot to write.
        const droppable = { setNodeRef: jest.fn() };

        // Act
        const { container } = renderPlane({ droppable });

        // Assert
        expect(container.querySelector('.note-plane').className).toBe('note-plane');
    });

    test('names the day it is the plane for', () => {
        // Act — a day id that is no note's id, so the wrong one cannot pass
        const { container } = renderPlane({ dayId: OTHER_DAY_ID, notes: [onOtherDay(1)] });

        // Assert
        expect(container.querySelector('.note-plane')).toHaveAttribute(
            'data-day-id',
            String(OTHER_DAY_ID)
        );
    });

    test('opens the note whose ribbon was pressed', async () => {
        // Arrange
        const onOpenNote = jest.fn();
        const notes = [onOtherDay(3), onOtherDay(4, { startMinutes: 720 })];
        renderPlane({ dayId: OTHER_DAY_ID, notes, onOpenNote });

        // Act
        await userEvent.click(screen.getByRole('button', { name: /note 4/ }));

        // Assert
        expect(onOpenNote).toHaveBeenCalledWith(4);
    });

    test('draws a note it could not place rather than dropping it', () => {
        // Arrange — one more than there are lanes, all over the same hour
        const notes = Array.from({ length: MAX_NOTE_LANES + 1 }, (unused, index) =>
            onOtherDay(index + 1)
        );

        // Act
        const { container } = renderPlane({ dayId: OTHER_DAY_ID, notes });

        // Assert
        expect(container.querySelectorAll('.note-ribbon')).toHaveLength(MAX_NOTE_LANES + 1);
        expect(container.querySelectorAll('.note-ribbon--unplaceable')).toHaveLength(1);
    });

    test('positions its ribbons against the plane, which is what a lane is measured in', () => {
        // Arrange — a lane is a percentage, and a percentage means nothing until
        // it is resolved against something. Only a real cascade shows which box
        // that is, so the sheet is loaded.
        const unload = loadStylesheets('Calendar.css');

        try {
            // Act
            const { container } = renderPlane({ dayId: OTHER_DAY_ID, notes: [onOtherDay(1)] });

            // Assert
            const plane = container.querySelector('.note-plane');
            const ribbon = container.querySelector('.note-ribbon');

            expect(getComputedStyle(plane).position).toBe('absolute');
            expect(getComputedStyle(ribbon).position).toBe('absolute');
            expect(containingBlockOf(ribbon)).toBe(plane);
        } finally {
            unload();
        }
    });

    test('stretches the create surface over the whole plane', () => {
        // Arrange — a press anywhere empty starts a draft, which is only true
        // while the surface covers every minute of the day rather than
        // collapsing to nothing behind the ribbons.
        const unload = loadStylesheets('Calendar.css');

        try {
            // Act
            const { container } = renderPlane({ dayId: OTHER_DAY_ID });

            // Assert
            const surface = getComputedStyle(container.querySelector('.note-plane-surface'));
            expect(surface.position).toBe('absolute');
            expect(surface.getPropertyValue('inset')).toBe('0');
            // The only thing that says an empty plane can be pressed at all:
            // there is no button, no outline and no hint text, so the cursor is
            // the whole affordance.
            expect(surface.cursor).toBe('crosshair');
        } finally {
            unload();
        }
    });

    test('lets the pointer through the draft it is drawing', () => {
        // Arrange — the ghost tracks the gesture, so for the whole of a create
        // it sits directly under the pointer. Taking pointer events it would
        // swallow the very moves that size it, and the draft would stick at
        // whatever height it had when it first reached the cursor.
        const unload = loadStylesheets('Calendar.css');

        try {
            // Act
            const { container } = renderPlane({
                dayId: OTHER_DAY_ID,
                draft: { startMinutes: 600, durationMinutes: 30, isAllowed: true },
            });

            // Assert
            const draft = getComputedStyle(container.querySelector('.note-draft'));
            expect(draft.pointerEvents).toBe('none');
        } finally {
            unload();
        }
    });
});
