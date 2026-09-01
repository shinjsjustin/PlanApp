import { act, renderHook } from '@testing-library/react';

import useConnectSelection from './useConnectSelection';

// The selection half of connect mode (spec section 4.7). Just a set and the
// three things that can happen to it — which parents are armed, and whether the
// canvas is in connect mode at all. What counts as an eligible target is
// `isEligibleChild` in `lib/graph`, and what a click on one does is the canvas's
// business; keeping those apart is what makes this testable without a canvas.

const AERODYNAMICS = 1;
const ELECTRONICS = 2;

describe('useConnectSelection', () => {
    test('starts with nothing selected and the canvas out of connect mode', () => {
        // Act
        const { result } = renderHook(() => useConnectSelection());

        // Assert
        expect(result.current.selectedIds.size).toBe(0);
        expect(result.current.isConnecting).toBe(false);
    });

    test('selecting a parent puts the canvas into connect mode', () => {
        // Arrange
        const { result } = renderHook(() => useConnectSelection());

        // Act
        act(() => result.current.toggleParent(AERODYNAMICS));

        // Assert
        expect(result.current.selectedIds.has(AERODYNAMICS)).toBe(true);
        expect(result.current.isConnecting).toBe(true);
    });

    test('clicking the same dot again takes the parent back out', () => {
        // Arrange
        const { result } = renderHook(() => useConnectSelection());
        act(() => result.current.toggleParent(AERODYNAMICS));

        // Act
        act(() => result.current.toggleParent(AERODYNAMICS));

        // Assert
        expect(result.current.selectedIds.has(AERODYNAMICS)).toBe(false);
        expect(result.current.isConnecting).toBe(false);
    });

    test('holds several parents at once', () => {
        // Arrange — aerodynamics and electronics both feed the rotor design,
        // and are armed together so one click connects both (spec section 1).
        const { result } = renderHook(() => useConnectSelection());

        // Act
        act(() => result.current.toggleParent(AERODYNAMICS));
        act(() => result.current.toggleParent(ELECTRONICS));

        // Assert
        expect([...result.current.selectedIds]).toEqual([AERODYNAMICS, ELECTRONICS]);
    });

    test('clearing empties the selection', () => {
        // Arrange
        const { result } = renderHook(() => useConnectSelection());
        act(() => result.current.toggleParent(AERODYNAMICS));
        act(() => result.current.toggleParent(ELECTRONICS));

        // Act
        act(() => result.current.clear());

        // Assert
        expect(result.current.selectedIds.size).toBe(0);
        expect(result.current.isConnecting).toBe(false);
    });

    test('builds a new set on each change rather than mutating the old one', () => {
        // Arrange
        const { result } = renderHook(() => useConnectSelection());
        const before = result.current.selectedIds;

        // Act
        act(() => result.current.toggleParent(AERODYNAMICS));

        // Assert
        expect(result.current.selectedIds).not.toBe(before);
        expect(before.size).toBe(0);
    });

    test('keeps the same empty set when clearing an already empty selection', () => {
        // Arrange — a click on empty canvas clears, and every click on empty
        // canvas must not re-render everything that reads the selection.
        const { result } = renderHook(() => useConnectSelection());
        const before = result.current.selectedIds;

        // Act
        act(() => result.current.clear());

        // Assert
        expect(result.current.selectedIds).toBe(before);
    });
});
