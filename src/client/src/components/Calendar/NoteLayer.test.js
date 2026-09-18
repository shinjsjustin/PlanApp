import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NoteLayer from './NoteLayer';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { DayScaleProvider } from '../../state/DayScaleContext';

const geometry = createDayGeometry(PX_PER_SLOT_MIN);

const note = (id, overrides = {}) => ({
    id,
    dayId: 1,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const renderLayer = (props = {}) => {
    const handlers = {
        onCreate: jest.fn(),
        onUpdate: jest.fn(),
        onDelete: jest.fn(),
    };

    const view = render(
        <DayScaleProvider value={geometry}>
            <NoteLayer dayId={1} label="Notes for Day 1" notes={[]} {...handlers} {...props} />
        </DayScaleProvider>
    );

    return { ...view, ...handlers };
};

/** jsdom gives every element a zero rect, so the plane's top is 0 throughout. */
const pressPlane = (container, clientY) => {
    const surface = container.querySelector('.note-plane-surface');

    // `pointerdown` is what the surface listens for; jsdom has no PointerEvent.
    const event = new MouseEvent('pointerdown', { bubbles: true, clientY, button: 0 });

    surface.dispatchEvent(event);
};

const releasePointer = () => {
    document.dispatchEvent(new MouseEvent('pointerup', {}));
};

describe('creating a note', () => {
    test('a press opens the popover for a default block', async () => {
        // Arrange
        const { container } = renderLayer();

        // Act
        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
        });
        act(() => releasePointer());

        // Assert
        expect(screen.getByLabelText('Note')).toBeInTheDocument();
        expect(screen.getByText('09:00–09:30')).toBeInTheDocument();
    });

    test('saving writes the note', async () => {
        // Arrange
        const { container, onCreate } = renderLayer();

        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
        });
        act(() => releasePointer());

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call{Enter}');

        // Assert
        expect(onCreate).toHaveBeenCalledWith({
            dayId: 1,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 30,
        });
    });

    test('cancelling writes nothing and closes', async () => {
        // Arrange
        const { container, onCreate } = renderLayer();

        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
        });
        act(() => releasePointer());

        // Act
        await userEvent.type(screen.getByLabelText('Note'), '{Escape}');

        // Assert
        expect(onCreate).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
    });

    test('a press on a full stretch of day opens nothing', async () => {
        // Arrange — four notes already covering 09:00
        const notes = [1, 2, 3, 4].map((id) => note(id));
        const { container, onCreate } = renderLayer({ notes });

        // Act
        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
        });
        act(() => releasePointer());

        // Assert
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
        expect(onCreate).not.toHaveBeenCalled();
    });
});

describe('opening an existing note', () => {
    test('clicking a ribbon opens it with its text', async () => {
        // Arrange
        renderLayer({ notes: [note(1, { text: 'kids at home' })] });

        // Act
        await userEvent.click(screen.getByRole('button', { name: /kids at home/ }));

        // Assert
        expect(screen.getByLabelText('Note')).toHaveValue('kids at home');
    });

    test('renaming it updates rather than creating', async () => {
        // Arrange
        const { onUpdate, onCreate } = renderLayer({ notes: [note(1)] });
        await userEvent.click(screen.getByRole('button', { name: /note 1/ }));

        // Act
        await userEvent.clear(screen.getByLabelText('Note'));
        await userEvent.type(screen.getByLabelText('Note'), 'renamed{Enter}');

        // Assert
        expect(onUpdate).toHaveBeenCalledWith(1, { text: 'renamed' });
        expect(onCreate).not.toHaveBeenCalled();
    });

    test('deleting it closes the popover', async () => {
        // Arrange
        const { onDelete } = renderLayer({ notes: [note(1)] });
        await userEvent.click(screen.getByRole('button', { name: /note 1/ }));

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // Assert
        expect(onDelete).toHaveBeenCalledWith(1);
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
    });

    test('a note that has gone while open closes the popover', async () => {
        // Arrange — a failed save rolls the note away underneath the popover
        const { rerender } = renderLayer({ notes: [note(1)] });
        await userEvent.click(screen.getByRole('button', { name: /note 1/ }));

        // Act
        rerender(
            <DayScaleProvider value={geometry}>
                <NoteLayer
                    dayId={1}
                    label="Notes for Day 1"
                    notes={[]}
                    onCreate={jest.fn()}
                    onUpdate={jest.fn()}
                    onDelete={jest.fn()}
                />
            </DayScaleProvider>
        );

        // Assert
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
    });
});
