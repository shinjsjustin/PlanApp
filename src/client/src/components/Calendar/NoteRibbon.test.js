import React, { act } from 'react';
import { DndContext, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NoteRibbon from './NoteRibbon';
import { MAX_NOTE_LANES } from '../../lib/noteLanes';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { DayScaleProvider } from '../../state/DayScaleContext';
import { loadStylesheets } from '../../testUtils/stylesheet';

const note = (overrides = {}) => ({
    id: 1,
    dayId: 1,
    text: 'train to Leeds',
    startMinutes: 540,
    durationMinutes: 120,
    ...overrides,
});

const renderRibbon = (props = {}) =>
    render(
        <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
            <NoteRibbon note={note()} lane={0} {...props} />
        </DayScaleProvider>
    );

const ribbonOf = (container) => container.querySelector('.note-ribbon');

const edgeNamed = (name) => screen.getByRole('separator', { name });

/**
 * A ribbon inside a real `DndContext`, lifted with the keyboard.
 *
 * The drag payload is dnd-kit's to keep, and a drag-start event is the only
 * place it comes back out — which is exactly where `dragKindOf` will read it, so
 * asserting on it here is asserting on the contract rather than on the wiring.
 * The keyboard sensor is the one the pointer-free jsdom can drive, the same way
 * `DragDropArea`'s suite drives the project drags.
 */
const LiftHarness = ({ onDragStart, ...props }) => {
    const sensors = useSensors(useSensor(KeyboardSensor));

    return (
        <DndContext sensors={sensors} onDragStart={onDragStart}>
            <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
                <NoteRibbon note={note()} lane={0} onOpen={jest.fn()} {...props} />
            </DayScaleProvider>
        </DndContext>
    );
};

const startEventOf = (onDragStart) => onDragStart.mock.calls[0][0];

/** Lifts the ribbon and returns the `onDragStart` spy the context was given. */
const liftRibbon = async (props = {}) => {
    const onDragStart = jest.fn();

    render(<LiftHarness onDragStart={onDragStart} {...props} />);

    const body = screen.getByRole('button', { name: /train to Leeds/ });

    body.focus();

    // `@dnd-kit` matches on `code`, which for the space bar is not its `key`.
    fireEvent.keyDown(body, { key: ' ', code: 'Space' });

    // `@dnd-kit` attaches the sensor a tick after the lift.
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    return onDragStart;
};

describe('NoteRibbon', () => {
    test('shows the note’s text', () => {
        // Act
        renderRibbon();

        // Assert
        expect(screen.getByText('train to Leeds')).toBeInTheDocument();
    });

    test('is drawn at the minute it starts and as tall as it lasts', () => {
        // Arrange
        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        // Act
        const { container } = renderRibbon();

        // Assert
        expect(ribbonOf(container)).toHaveStyle({
            top: `${geometry.minutesToPx(540)}px`,
            height: `${geometry.minutesToPx(120)}px`,
        });
    });

    test('lane 0 sits at the right-hand edge of the plane', () => {
        // Act
        const { container } = renderRibbon({ lane: 0 });

        // Assert
        expect(ribbonOf(container)).toHaveStyle({
            right: '0%',
            width: `${100 / MAX_NOTE_LANES}%`,
        });
    });

    test('each further lane steps leftward by one lane width', () => {
        // Act
        const { container } = renderRibbon({ lane: 2 });

        // Assert — the width is asserted here as well as in lane 0, because a
        // width derived from the lane index rather than fixed would be correct
        // in lane 0 and wrong everywhere else.
        expect(ribbonOf(container)).toHaveStyle({
            right: `${(2 * 100) / MAX_NOTE_LANES}%`,
            width: `${100 / MAX_NOTE_LANES}%`,
        });
    });

    test('a note with no free lane is marked rather than hidden', () => {
        // Act
        const { container } = renderRibbon({ lane: null });

        // Assert
        expect(ribbonOf(container)).toHaveClass('note-ribbon--unplaceable');
        expect(screen.getByText('train to Leeds')).toBeInTheDocument();
    });

    test('opens the note when clicked', async () => {
        // Arrange
        const onOpen = jest.fn();
        renderRibbon({ onOpen });

        // Act
        await userEvent.click(screen.getByRole('button', { name: /train to Leeds/ }));

        // Assert
        expect(onOpen).toHaveBeenCalledWith(1);
    });

    test('is plain text when there is nowhere to open', () => {
        // Act
        renderRibbon({ onOpen: null });

        // Assert
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('has no resize edges until it is given some', () => {
        // Act
        renderRibbon();

        // Assert
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    test('draws both edges when it is given them', () => {
        // Arrange
        const resize = { top: { handleProps: {} }, bottom: { handleProps: {} } };

        // Act
        renderRibbon({ resize });

        // Assert — by class as well as by count, because which end of the ribbon
        // an edge is drawn at is the stylesheet's job and nothing else here
        // would notice the two being swapped.
        expect(screen.getAllByRole('separator')).toHaveLength(2);
        expect(edgeNamed(/Change when .*train to Leeds.* starts/)).toHaveClass(
            'note-ribbon-edge',
            'note-ribbon-edge--top'
        );
        expect(edgeNamed(/Change how long .*train to Leeds.* lasts/)).toHaveClass(
            'note-ribbon-edge',
            'note-ribbon-edge--bottom'
        );
    });

    test('each edge starts its own half of the resize', () => {
        // Arrange
        const startTop = jest.fn();
        const startBottom = jest.fn();
        const resize = {
            top: { handleProps: { onPointerDown: startTop } },
            bottom: { handleProps: { onPointerDown: startBottom } },
        };
        renderRibbon({ resize });

        // Act
        fireEvent.pointerDown(edgeNamed(/Change when .*train to Leeds.* starts/));
        fireEvent.pointerDown(edgeNamed(/Change how long .*train to Leeds.* lasts/));

        // Assert
        expect(startTop).toHaveBeenCalledTimes(1);
        expect(startBottom).toHaveBeenCalledTimes(1);
    });

    test('opens the note it was given rather than the day it sits in', async () => {
        // Arrange
        const onOpen = jest.fn();
        renderRibbon({ note: note({ id: 42, dayId: 7 }), onOpen });

        // Act
        await userEvent.click(screen.getByRole('button', { name: /train to Leeds/ }));

        // Assert
        expect(onOpen).toHaveBeenCalledWith(42);
    });

    test('reads out the time range the ribbon has no room to print', () => {
        // Act
        renderRibbon({ onOpen: jest.fn() });

        // Assert
        expect(
            screen.getByRole('button', { name: 'train to Leeds, 09:00–11:00' })
        ).toBeInTheDocument();
    });

    test('puts the text in its own element, which is what the stylesheet rotates', () => {
        // Act
        renderRibbon({ onOpen: jest.fn() });

        // Assert
        expect(screen.getByText('train to Leeds')).toHaveClass('note-ribbon-text');
    });

    test('rotates the text of a ribbon with nowhere to open too', () => {
        // Act
        renderRibbon({ onOpen: null });

        // Assert
        expect(screen.getByText('train to Leeds')).toHaveClass('note-ribbon-text');
    });

    test('the stylesheet really does turn that element on its side', () => {
        // Arrange — the two tests above assert the class the sheet hangs the
        // rotation on, which is worth nothing if the sheet stops rotating it.
        // A ribbon is a quarter of half a column wide — around 20px — and a
        // label printed across it would be one clipped character (decision 3),
        // so the rotation is the feature rather than a flourish.
        const unload = loadStylesheets('Calendar.css');

        try {
            // Act
            renderRibbon({ onOpen: jest.fn() });

            // Assert — `vertical-rl` turned a half turn, rather than
            // `sideways-lr`, which only Firefox implements.
            const style = getComputedStyle(screen.getByText('train to Leeds'));
            expect(style.getPropertyValue('writing-mode')).toBe('vertical-rl');
            expect(style.transform).toBe('rotate(180deg)');
        } finally {
            unload();
        }
    });

    test('draws an unplaceable note in lane 0, where it is at least visible', () => {
        // Act
        const { container } = renderRibbon({ lane: null });

        // Assert
        expect(ribbonOf(container)).toHaveStyle({ right: '0%' });
    });

    test('treats a lane that never arrived the same as one that does not exist', () => {
        // Arrange — what a caller reading its lane out of a `Map` hands over
        // when the lookup misses.

        // Act
        const { container } = renderRibbon({ lane: undefined });

        // Assert
        expect(ribbonOf(container)).toHaveClass('note-ribbon--unplaceable');
        expect(ribbonOf(container)).toHaveStyle({ right: '0%' });
    });

    test('keeps the body class the stylesheet sizes the ribbon by', () => {
        // Act
        const { rerender } = renderRibbon({ onOpen: jest.fn() });

        // Assert
        expect(screen.getByRole('button', { name: /train to Leeds/ })).toHaveClass(
            'note-ribbon-body'
        );

        // Act — and the same for a ribbon with nowhere to open.
        rerender(
            <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
                <NoteRibbon note={note()} lane={0} onOpen={null} />
            </DayScaleProvider>
        );

        // Assert
        expect(screen.getByText('train to Leeds').parentElement).toHaveClass('note-ribbon-body');
    });

    test('reads out the time range even when the ribbon is not a control', () => {
        // Act
        renderRibbon({ onOpen: null });

        // Assert
        expect(screen.getByLabelText('train to Leeds, 09:00–11:00')).toBeInTheDocument();
    });
});

describe('NoteRibbon in flight', () => {
    test('a lifted ribbon carries its note id, which is what marks the drop as a note', async () => {
        // Act
        const onDragStart = await liftRibbon({ isDraggable: true });

        // Assert
        expect(onDragStart).toHaveBeenCalledTimes(1);
        expect(startEventOf(onDragStart).active.id).toBe('note-1');
        expect(startEventOf(onDragStart).active.data.current).toEqual({ noteId: 1 });
    });

    test('lifts the note it belongs to rather than the day it sits in', async () => {
        // Arrange — an id that cannot be confused with the day's, because the
        // drop is routed by this number and a ribbon that reported its day would
        // move some other note.

        // Act
        const onDragStart = await liftRibbon({
            note: note({ id: 42, dayId: 7 }),
            isDraggable: true,
        });

        // Assert
        expect(startEventOf(onDragStart).active.id).toBe('note-42');
        expect(startEventOf(onDragStart).active.data.current).toEqual({ noteId: 42 });
    });

    test('a lifted ribbon announces itself as draggable', async () => {
        // Act
        await liftRibbon({ isDraggable: true });

        // Assert — dnd-kit's `attributes` carry the whole keyboard-drag
        // affordance, and this is the one of them a screen reader speaks.
        expect(screen.getByRole('button', { name: /train to Leeds/ })).toHaveAttribute(
            'aria-roledescription',
            'draggable'
        );
    });

    test('hands dnd-kit the ribbon itself, so a drop has a rectangle to measure', async () => {
        // Act
        const onDragStart = await liftRibbon({ isDraggable: true });

        // Assert — `CalendarDragArea` reads this rect to work out the minute a
        // drop landed on; a ribbon that never registered its node has none.
        expect(startEventOf(onDragStart).active.rect.current.translated).not.toBeNull();
    });

    test('cannot be lifted until it is told it is draggable', async () => {
        // Act
        const onDragStart = await liftRibbon();

        // Assert
        expect(onDragStart).not.toHaveBeenCalled();
    });
});
