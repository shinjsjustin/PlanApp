import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import useResizeEdge, { EDGE, rectFor } from './useResizeEdge';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../lib/scheduleGeometry';

const item = { todoId: 7, startMinutes: 540, durationMinutes: 60 };

describe('rectFor', () => {

    test('the bottom edge changes only the duration', () => {
        expect(rectFor(item, { edge: 'bottom', deltaMinutes: 60, floor: 0 })).toEqual({
            startMinutes: 540,
            durationMinutes: 120,
        });
    });

    test('the bottom edge stops at one slot', () => {
        expect(rectFor(item, { edge: 'bottom', deltaMinutes: -600, floor: 0 })).toEqual({
            startMinutes: 540,
            durationMinutes: 30,
        });
    });

    test('the bottom edge may pass midnight, for the spill to resolve', () => {
        const late = { todoId: 7, startMinutes: 1380, durationMinutes: 60 };

        expect(rectFor(late, { edge: 'bottom', deltaMinutes: 120, floor: 0 })).toEqual({
            startMinutes: 1380,
            durationMinutes: 180,
        });
    });

    test('the top edge moves the start and keeps the end fixed', () => {
        expect(rectFor(item, { edge: 'top', deltaMinutes: -60, floor: 0 })).toEqual({
            startMinutes: 480,
            durationMinutes: 120,
        });
    });

    test('the top edge clamps at the item above and never pushes it', () => {
        // Arrange — the item above ends at 10:00
        expect(rectFor(item, { edge: 'top', deltaMinutes: -600, floor: 600 })).toEqual({
            startMinutes: 600,
            durationMinutes: 30,
        });
    });

    test('the top edge cannot swallow its own end', () => {
        expect(rectFor(item, { edge: 'top', deltaMinutes: 600, floor: 0 })).toEqual({
            startMinutes: 570,
            durationMinutes: 30,
        });
    });
});

describe('useResizeEdge across a spill', () => {
    // The gesture that moves its own card out from under itself.
    //
    // A bottom edge dragged past midnight spills the booking into the next day,
    // so React unmounts the card from one column's subtree and mounts a fresh
    // one in the next column's — mid-gesture, with the button still held. Any
    // resize state owned by the card dies there, and the release is never heard.
    //
    // The harness is that shape and nothing else: two columns, and a booking
    // that hops between them while the pointer is down.
    const Edge = ({ startResize }) => (
        <span
            role="separator"
            aria-label="Change how long it lasts"
            onPointerDown={(event) => startResize(event)}
        />
    );

    const Column = ({ name, children }) => (
        <div role="region" aria-label={name}>
            {children}
        </div>
    );

    const Harness = ({ onCommit }) => {
        const [dayIndex, setDayIndex] = useState(0);

        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        const { startResize } = useResizeEdge({
            geometry,
            resolve: () => ({ item, floor: 0 }),
            onPreview: () => setDayIndex(1),
            onCommit,
            onCancel: jest.fn(),
        });

        const edge = <Edge startResize={(event) => startResize(item.todoId, 'bottom', event)} />;

        return (
            <>
                <Column name="Day 1">{dayIndex === 0 && edge}</Column>
                <Column name="Day 2">{dayIndex === 1 && edge}</Column>
            </>
        );
    };

    test('commits a resize whose card moved to another day mid-gesture', () => {
        // Arrange
        const onCommit = jest.fn();
        render(<Harness onCommit={onCommit} />);

        // Act — press the edge, drag far enough to spill, release
        fireEvent.pointerDown(screen.getByRole('separator'), { clientY: 100 });
        fireEvent.pointerMove(document, { clientY: 2100 });

        // The card has already moved: the edge under the pointer is Day 2's.
        expect(
            within(screen.getByRole('region', { name: 'Day 2' })).getByRole('separator')
        ).toBeInTheDocument();

        fireEvent.pointerUp(document, { clientY: 2100 });

        // Assert
        expect(onCommit).toHaveBeenCalledTimes(1);
    });
});

describe('rectFor at a stretched scale', () => {
    test('is unaffected by the scale, because it works in minutes', () => {
        // Arrange — rectFor never sees pixels; the caller converts first. This
        // pins that, so a future change that smuggles a scale in here fails.
        const item = { todoId: 1, startMinutes: 540, durationMinutes: 60 };

        // Act
        const rect = rectFor(item, { edge: EDGE.bottom, deltaMinutes: 30, floor: 0 });

        // Assert
        expect(rect).toEqual({ startMinutes: 540, durationMinutes: 90 });
    });
});
