import { act, renderHook } from '@testing-library/react';

import { usePinSelectionState } from './PinSelectionContext';

const unpinnedTodo = { id: 1, text: 'Wire up token refresh', isPinned: false };
const pinnedTodo = { id: 2, text: 'Test the refresh path', isPinned: true };

const renderSelection = (setTodosPinned = jest.fn()) => {
    const view = renderHook(() => usePinSelectionState(setTodosPinned));

    return { ...view, setTodosPinned };
};

describe('usePinSelectionState', () => {
    test('marks only unpinned to-dos eligible in pin mode', () => {
        // Arrange
        const { result } = renderSelection();

        // Act
        act(() => result.current.startPin());

        // Assert
        expect(result.current.isEligible(unpinnedTodo)).toBe(true);
        expect(result.current.isEligible(pinnedTodo)).toBe(false);
    });

    test('marks only pinned to-dos eligible in unpin mode', () => {
        // Arrange
        const { result } = renderSelection();

        // Act
        act(() => result.current.startUnpin());

        // Assert
        expect(result.current.isEligible(unpinnedTodo)).toBe(false);
        expect(result.current.isEligible(pinnedTodo)).toBe(true);
    });

    test('replaces the selection Set without changing the previous Set', () => {
        // Arrange
        const { result } = renderSelection();
        act(() => result.current.startPin());
        const previousSelection = result.current.selectedTodoIds;

        // Act
        act(() => result.current.toggle(1));

        // Assert
        expect(result.current.selectedTodoIds).not.toBe(previousSelection);
        expect(previousSelection).toEqual(new Set());
        expect(result.current.selectedTodoIds).toEqual(new Set([1]));
    });

    test('accumulates several rows and deselects a row when toggled again', () => {
        // Arrange
        const { result } = renderSelection();
        act(() => result.current.startPin());

        // Act
        act(() => {
            result.current.toggle(1);
            result.current.toggle(2);
        });
        act(() => result.current.toggle(1));

        // Assert
        expect(result.current.selectedTodoIds).toEqual(new Set([2]));
    });

    test('sends one batch and exits only after a successful confirmation', async () => {
        // Arrange
        let finishSaving;
        const setTodosPinned = jest.fn(
            () => new Promise((resolve) => {
                finishSaving = resolve;
            })
        );
        const { result } = renderSelection(setTodosPinned);
        act(() => result.current.startPin());
        act(() => {
            result.current.toggle(1);
            result.current.toggle(2);
        });

        // Act
        let confirmation;
        act(() => {
            confirmation = result.current.confirm();
        });

        // Assert — the draft remains visible while the one request is in flight.
        expect(setTodosPinned).toHaveBeenCalledTimes(1);
        expect(setTodosPinned).toHaveBeenCalledWith([1, 2], true);
        expect(result.current.mode).toBe('pin');
        expect(result.current.isSaving).toBe(true);

        await act(async () => {
            finishSaving({ todos: [] });
            await confirmation;
        });

        expect(result.current.mode).toBe('idle');
        expect(result.current.selectedTodoIds).toEqual(new Set());
        expect(result.current.isSaving).toBe(false);
    });

    test('keeps the mode and selection when confirmation fails', async () => {
        // Arrange
        const setTodosPinned = jest.fn().mockResolvedValue(null);
        const { result } = renderSelection(setTodosPinned);
        act(() => result.current.startUnpin());
        act(() => result.current.toggle(2));

        // Act
        await act(async () => result.current.confirm());

        // Assert
        expect(result.current.mode).toBe('unpin');
        expect(result.current.selectedTodoIds).toEqual(new Set([2]));
        expect(result.current.isSaving).toBe(false);
    });

    test('cancels the draft without sending a request', () => {
        // Arrange
        const { result, setTodosPinned } = renderSelection();
        act(() => result.current.startPin());
        act(() => result.current.toggle(1));

        // Act
        act(() => result.current.cancel());

        // Assert
        expect(result.current.mode).toBe('idle');
        expect(result.current.selectedTodoIds).toEqual(new Set());
        expect(setTodosPinned).not.toHaveBeenCalled();
    });
});
