import { renderHook, act } from '@testing-library/react';
import useFullTextTip from './useFullTextTip';

jest.mock('@dnd-kit/core', () => ({ useDndContext: () => ({ active: null }) }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const clickOn = (target) => ({ target });
const plain = () => document.createElement('div');

const open = (result) => {
    act(() => result.current.triggerProps.onMouseEnter());
    act(() => jest.advanceTimersByTime(400));
};

test('opens after the hover delay and closes on mouse leave', () => {
    const { result } = renderHook(() => useFullTextTip());
    act(() => result.current.triggerProps.onMouseEnter());
    act(() => jest.advanceTimersByTime(399));
    expect(result.current.isOpen).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.triggerProps.onMouseLeave());
    expect(result.current.isOpen).toBe(false);
});

test('aria-describedby equals tipId only while open', () => {
    const { result } = renderHook(() => useFullTextTip());
    expect(result.current.tipId).toBeTruthy();
    expect(result.current.triggerProps['aria-describedby']).toBeUndefined();
    open(result);
    expect(result.current.triggerProps['aria-describedby']).toBe(result.current.tipId);
});

test('a click pins the tip so mouse leave keeps it open, second tap closes', () => {
    const { result } = renderHook(() => useFullTextTip());
    act(() => result.current.triggerProps.onClick(clickOn(plain())));
    act(() => result.current.triggerProps.onMouseLeave());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.triggerProps.onClick(clickOn(plain())));
    expect(result.current.isOpen).toBe(false);
});

test('clicks inside a button or separator do not pin', () => {
    const { result } = renderHook(() => useFullTextTip());
    const button = document.createElement('button');
    const inner = document.createElement('span');
    button.appendChild(inner);
    const sep = document.createElement('div');
    sep.setAttribute('role', 'separator');
    act(() => result.current.triggerProps.onClick(clickOn(inner)));
    act(() => result.current.triggerProps.onClick(clickOn(sep)));
    expect(result.current.isOpen).toBe(false);
});

test('Escape closes a pinned tip', () => {
    const { result } = renderHook(() => useFullTextTip());
    act(() => result.current.triggerProps.onClick(clickOn(plain())));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.isOpen).toBe(false);
});

test('outside pointerdown closes a pinned tip but inside the anchor does not', () => {
    const { result } = renderHook(() => useFullTextTip());
    const anchor = document.createElement('div');
    const child = document.createElement('span');
    anchor.appendChild(child);
    document.body.appendChild(anchor);
    result.current.anchorRef.current = anchor;
    act(() => result.current.triggerProps.onClick(clickOn(child)));
    act(() => { child.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(result.current.isOpen).toBe(true);
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(result.current.isOpen).toBe(false);
    anchor.remove();
});

test('removes document listeners on close and unmount', () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    const { result, unmount } = renderHook(() => useFullTextTip());
    act(() => result.current.triggerProps.onClick(clickOn(plain())));
    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(add).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    add.mockRestore();
    remove.mockRestore();
});
