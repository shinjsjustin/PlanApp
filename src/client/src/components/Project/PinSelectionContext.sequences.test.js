import { act, renderHook } from '@testing-library/react';

import { usePinSelectionState } from './PinSelectionContext';

const unpinnedSequence = { id: 100, title: 'A', isPinned: false };
const pinnedSequence = { id: 101, title: 'B', isPinned: true };

const renderSelection = () => {
    const setTodosPinned = jest.fn().mockResolvedValue([]);
    const setPinned = jest.fn().mockResolvedValue({});
    const view = renderHook(() => usePinSelectionState(setTodosPinned, setPinned));

    return { ...view, setTodosPinned, setPinned };
};

describe('usePinSelectionState with sequences', () => {
    test('marks only unpinned sequences eligible in pin mode', () => {
        const { result } = renderSelection();

        act(() => result.current.startPin());

        expect(result.current.isSequenceEligible(unpinnedSequence)).toBe(true);
        expect(result.current.isSequenceEligible(pinnedSequence)).toBe(false);
    });

    test('marks only pinned sequences eligible in unpin mode', () => {
        const { result } = renderSelection();

        act(() => result.current.startUnpin());

        expect(result.current.isSequenceEligible(unpinnedSequence)).toBe(false);
        expect(result.current.isSequenceEligible(pinnedSequence)).toBe(true);
    });

    test('no sequence is eligible while idle', () => {
        const { result } = renderSelection();

        expect(result.current.isSequenceEligible(unpinnedSequence)).toBe(false);
        expect(result.current.isSequenceEligible(pinnedSequence)).toBe(false);
    });

    test('toggles a sequence in and out without mutating the previous Set', () => {
        const { result } = renderSelection();
        act(() => result.current.startPin());
        const before = result.current.selectedSequenceIds;

        act(() => result.current.toggleSequence(100));
        expect(result.current.isSequenceSelected(100)).toBe(true);
        expect(before).toEqual(new Set());

        act(() => result.current.toggleSequence(100));
        expect(result.current.isSequenceSelected(100)).toBe(false);
    });

    test('cancel clears the sequence selection', () => {
        const { result } = renderSelection();
        act(() => result.current.startPin());
        act(() => result.current.toggleSequence(100));

        act(() => result.current.cancel());

        expect(result.current.selectedSequenceIds).toEqual(new Set());
    });

    test('starting a new mode clears the sequence selection', () => {
        const { result } = renderSelection();
        act(() => result.current.startPin());
        act(() => result.current.toggleSequence(100));

        act(() => result.current.startUnpin());

        expect(result.current.selectedSequenceIds).toEqual(new Set());
    });

    test('a to-do-only batch still calls setTodosPinned', async () => {
        const { result, setTodosPinned, setPinned } = renderSelection();
        act(() => result.current.startPin());
        act(() => result.current.toggle(1));

        await act(async () => { await result.current.confirm(); });

        expect(setTodosPinned).toHaveBeenCalledWith([1], true);
        expect(setPinned).not.toHaveBeenCalled();
    });

    test('a sequence-only batch calls setPinned with both id lists', async () => {
        const { result, setTodosPinned, setPinned } = renderSelection();
        act(() => result.current.startUnpin());
        act(() => result.current.toggleSequence(101));

        await act(async () => { await result.current.confirm(); });

        expect(setPinned).toHaveBeenCalledWith({ todoIds: [], sequenceIds: [101] }, false);
        expect(setTodosPinned).not.toHaveBeenCalled();
        expect(result.current.mode).toBe('idle');
        expect(result.current.selectedSequenceIds).toEqual(new Set());
    });

    test('a mixed batch calls setPinned once with both lists', async () => {
        const { result, setPinned } = renderSelection();
        act(() => result.current.startPin());
        act(() => {
            result.current.toggle(1);
            result.current.toggleSequence(100);
        });

        await act(async () => { await result.current.confirm(); });

        expect(setPinned).toHaveBeenCalledTimes(1);
        expect(setPinned).toHaveBeenCalledWith({ todoIds: [1], sequenceIds: [100] }, true);
    });

    test('a selected sequence stays eligible while saving', async () => {
        let finish;
        const setPinned = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
        const setTodosPinned = jest.fn();
        const { result } = renderHook(() => usePinSelectionState(setTodosPinned, setPinned));
        act(() => result.current.startPin());
        act(() => result.current.toggleSequence(100));

        let pending;
        act(() => { pending = result.current.confirm(); });

        expect(result.current.isSaving).toBe(true);
        expect(result.current.isSequenceEligible({ id: 100, isPinned: true })).toBe(true);

        await act(async () => { finish({}); await pending; });
    });
});
