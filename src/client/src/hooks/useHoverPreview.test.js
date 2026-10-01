import { renderHook, act } from '@testing-library/react';
import useHoverPreview from './useHoverPreview';

let mockActive = null;
jest.mock('@dnd-kit/core', () => ({ useDndContext: () => ({ active: mockActive }) }));

beforeEach(() => {
    jest.useFakeTimers();
    mockActive = null;
});
afterEach(() => jest.useRealTimers());

const setup = () => renderHook((props) => useHoverPreview(props), { initialProps: {} });

test('opens after 400 ms of hover and closes on leave', () => {
    const { result } = setup();
    act(() => result.current.triggerProps.onMouseEnter());
    act(() => jest.advanceTimersByTime(399));
    expect(result.current.isOpen).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.triggerProps.onMouseLeave());
    expect(result.current.isOpen).toBe(false);
});

test('opens on focus and closes on blur', () => {
    const { result } = setup();
    act(() => result.current.triggerProps.onFocus());
    act(() => jest.advanceTimersByTime(400));
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.triggerProps.onBlur());
    expect(result.current.isOpen).toBe(false);
});

test('leaving before the delay cancels the pending open', () => {
    const { result } = setup();
    act(() => result.current.triggerProps.onMouseEnter());
    act(() => jest.advanceTimersByTime(300));
    act(() => result.current.triggerProps.onMouseLeave());
    act(() => jest.advanceTimersByTime(500));
    expect(result.current.isOpen).toBe(false);
});

test('never opens while a drag is active', () => {
    mockActive = { id: 'x' };
    const { result } = setup();
    act(() => result.current.triggerProps.onMouseEnter());
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current.isOpen).toBe(false);
});

test('closes when a drag starts while open', () => {
    const { result, rerender } = setup();
    act(() => result.current.triggerProps.onMouseEnter());
    act(() => jest.advanceTimersByTime(400));
    expect(result.current.isOpen).toBe(true);
    mockActive = { id: 'x' };
    rerender({});
    expect(result.current.isOpen).toBe(false);
});

test('unmounting clears the pending timer', () => {
    const { result, unmount } = setup();
    act(() => result.current.triggerProps.onMouseEnter());
    unmount();
    expect(jest.getTimerCount()).toBe(0);
});

test('honors a custom delay', () => {
    const { result } = renderHook(() => useHoverPreview({ delayMs: 100 }));
    act(() => result.current.triggerProps.onMouseEnter());
    act(() => jest.advanceTimersByTime(100));
    expect(result.current.isOpen).toBe(true);
});
