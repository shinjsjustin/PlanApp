import { act, renderHook } from '@testing-library/react';

import useNoteDraft, { rangeFor } from './useNoteDraft';
import { MIN_DURATION } from '../lib/schedule';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../lib/scheduleGeometry';

const geometry = createDayGeometry(PX_PER_SLOT_MIN);

/** A plane 1152px tall whose top edge is at y=0, which is what a day is at the floor. */
const planeRect = { top: 0, height: geometry.dayHeightPx };

const stubSurface = () => ({ getBoundingClientRect: () => planeRect });

const press = (result, clientY, options = {}) =>
    act(() =>
        result.current.startDraft(1, {
            clientY,
            currentTarget: stubSurface(),
            preventDefault: () => {},
            stopPropagation: () => {},
            ...options,
        })
    );

const movePointer = (clientY) =>
    act(() => {
        document.dispatchEvent(new MouseEvent('pointermove', { clientY }));
    });

const release = () =>
    act(() => {
        document.dispatchEvent(new MouseEvent('pointerup', {}));
    });

const renderDraft = (overrides = {}) => {
    const onCommit = jest.fn();

    const view = renderHook(() =>
        useNoteDraft({
            geometry,
            canPlaceAt: () => true,
            onCommit,
            ...overrides,
        })
    );

    return { ...view, onCommit };
};

describe('rangeFor', () => {
    test('a press with no movement is one default block', () => {
        // Act & Assert
        expect(rangeFor(540, 540)).toEqual({ startMinutes: 540, durationMinutes: 30 });
    });

    test('a downward drag runs from the press to the release', () => {
        // Act & Assert
        expect(rangeFor(540, 660)).toEqual({ startMinutes: 540, durationMinutes: 120 });
    });

    test('an upward drag is the same gesture, the other way round', () => {
        // Act & Assert
        expect(rangeFor(660, 540)).toEqual({ startMinutes: 540, durationMinutes: 120 });
    });

    test('never returns less than one slot', () => {
        // Act & Assert
        expect(rangeFor(540, 545).durationMinutes).toBe(MIN_DURATION);
    });

    test('is held inside the day at the bottom', () => {
        // Act & Assert — a press at 23:30 can only be half an hour long
        expect(rangeFor(1410, 1440)).toEqual({ startMinutes: 1410, durationMinutes: 30 });
    });
});

describe('useNoteDraft', () => {
    test('has no draft until something is pressed', () => {
        // Act
        const { result } = renderDraft();

        // Assert
        expect(result.current.draft).toBeNull();
    });

    test('a press starts a default-length draft at that minute', () => {
        // Arrange
        const { result } = renderDraft();

        // Act — 09:00 is 540 minutes down
        press(result, geometry.minutesToPx(540));

        // Assert
        expect(result.current.draft).toMatchObject({
            dayId: 1,
            startMinutes: 540,
            durationMinutes: 30,
            isAllowed: true,
        });
    });

    test('dragging extends it, snapped to the grid', () => {
        // Arrange
        const { result } = renderDraft();
        press(result, geometry.minutesToPx(540));

        // Act
        movePointer(geometry.minutesToPx(660));

        // Assert
        expect(result.current.draft).toMatchObject({
            startMinutes: 540,
            durationMinutes: 120,
        });
    });

    test('marks a draft the day has no room for', () => {
        // Arrange
        const { result } = renderDraft({ canPlaceAt: () => false });

        // Act
        press(result, geometry.minutesToPx(540));

        // Assert
        expect(result.current.draft.isAllowed).toBe(false);
    });

    test('commits the range on release', () => {
        // Arrange
        const { result, onCommit } = renderDraft();
        press(result, geometry.minutesToPx(540));
        movePointer(geometry.minutesToPx(660));

        // Act
        release();

        // Assert
        expect(onCommit).toHaveBeenCalledWith({
            dayId: 1,
            startMinutes: 540,
            durationMinutes: 120,
        });
        expect(result.current.draft).toBeNull();
    });

    test('commits nothing when the day has no room', () => {
        // Arrange
        const { result, onCommit } = renderDraft({ canPlaceAt: () => false });
        press(result, geometry.minutesToPx(540));

        // Act
        release();

        // Assert — the refusal is the ghost; the release is simply ignored
        expect(onCommit).not.toHaveBeenCalled();
        expect(result.current.draft).toBeNull();
    });

    test('Escape abandons it', () => {
        // Arrange
        const { result, onCommit } = renderDraft();
        press(result, geometry.minutesToPx(540));

        // Act
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });

        // Assert
        expect(result.current.draft).toBeNull();
        expect(onCommit).not.toHaveBeenCalled();
    });

    test('ignores a press that is not the primary button', () => {
        // Arrange
        const { result } = renderDraft();

        // Act
        press(result, geometry.minutesToPx(540), { button: 2 });

        // Assert
        expect(result.current.draft).toBeNull();
    });
});
