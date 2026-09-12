import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

import useSequenceSpotlight from './useSequenceSpotlight';

const wrapperFor = (initialEntry) => ({ children }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
            <Route path="/projects/:id" element={children} />
        </Routes>
    </MemoryRouter>
);

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useSequenceSpotlight', () => {
    test('flashes nothing when no sequence was asked for', () => {
        // Arrange + Act
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2'),
        });

        // Assert
        expect(result.current).toBeNull();
    });

    test('waits before flashing, because the card is not on screen yet', () => {
        // Arrange
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2?sequence=9'),
        });

        // Assert — nothing immediately
        expect(result.current).toBeNull();

        // Act
        act(() => jest.advanceTimersByTime(600));

        // Assert
        expect(result.current).toBe(9);
    });

    test('stops flashing on its own', () => {
        // Arrange
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2?sequence=9'),
        });
        act(() => jest.advanceTimersByTime(600));

        // Act
        act(() => jest.advanceTimersByTime(2000));

        // Assert
        expect(result.current).toBeNull();
    });

    test('holds off until the graph is ready', () => {
        // Arrange
        const { result, rerender } = renderHook(({ ready }) => useSequenceSpotlight(ready), {
            wrapper: wrapperFor('/projects/2?sequence=9'),
            initialProps: { ready: false },
        });

        // Act
        act(() => jest.advanceTimersByTime(5000));

        // Assert — still nothing; the card has not rendered
        expect(result.current).toBeNull();

        // Act
        rerender({ ready: true });
        act(() => jest.advanceTimersByTime(600));

        // Assert
        expect(result.current).toBe(9);
    });

    test('ignores a sequence parameter that is not an id', () => {
        // Arrange
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2?sequence=nonsense'),
        });

        // Act
        act(() => jest.advanceTimersByTime(600));

        // Assert
        expect(result.current).toBeNull();
    });
});
