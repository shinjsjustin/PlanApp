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

        // Act
        renderPlane({ notes: [note(1)], ribbonFor });

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

        // Act
        const { container } = renderPlane({
            droppable: { setNodeRef, className: 'note-plane--over' },
        });

        // Assert — dnd-kit measures the node it is handed, so it must be the
        // plane itself and not some inner box.
        const plane = container.querySelector('.note-plane');
        expect(setNodeRef).toHaveBeenCalledWith(plane);
        expect(plane).toHaveClass('note-plane--over');
    });

    test('carries no droppable class when nothing is dropping on it', () => {
        // Act
        const { container } = renderPlane();

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
        } finally {
            unload();
        }
    });
});
