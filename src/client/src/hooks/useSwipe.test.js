import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import useSwipe from './useSwipe';

function setScroll(el, { scrollTop, clientHeight, scrollHeight }) {
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
}

function Harness({ onSwipe, withRef = true, scroll }) {
  const scrollRef = React.useRef(null);
  const handlers = useSwipe({ onSwipe, scrollRef: withRef ? scrollRef : undefined });
  return (
    <div data-testid="box" {...handlers}>
      <div
        data-testid="scroller"
        ref={(el) => {
          scrollRef.current = el;
          if (el && scroll) setScroll(el, scroll);
        }}
      />
    </div>
  );
}

const swipe = (box, from, to) => {
  fireEvent.touchStart(box, { touches: [{ clientX: from[0], clientY: from[1] }] });
  fireEvent.touchEnd(box, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
};

const MIDDLE = { scrollTop: 100, clientHeight: 100, scrollHeight: 500 };
const TOP = { scrollTop: 0, clientHeight: 100, scrollHeight: 500 };
const BOTTOM = { scrollTop: 400, clientHeight: 100, scrollHeight: 500 };

describe('useSwipe', () => {
  test('horizontal swipes always fire with finger direction', () => {
    const onSwipe = jest.fn();
    const { getByTestId } = render(<Harness onSwipe={onSwipe} scroll={MIDDLE} />);
    swipe(getByTestId('box'), [200, 100], [100, 100]);
    swipe(getByTestId('box'), [100, 100], [200, 100]);
    expect(onSwipe.mock.calls).toEqual([['left'], ['right']]);
  });

  test('up fires only at bottom', () => {
    const onSwipe = jest.fn();
    const mid = render(<Harness onSwipe={onSwipe} scroll={MIDDLE} />);
    swipe(mid.getByTestId('box'), [100, 300], [100, 200]);
    expect(onSwipe).not.toHaveBeenCalled();
    const bottom = render(<Harness onSwipe={onSwipe} scroll={BOTTOM} />);
    swipe(bottom.getAllByTestId('box')[1], [100, 300], [100, 200]);
    expect(onSwipe).toHaveBeenCalledWith('up');
  });

  test('down fires only at top', () => {
    const onSwipe = jest.fn();
    const mid = render(<Harness onSwipe={onSwipe} scroll={MIDDLE} />);
    swipe(mid.getByTestId('box'), [100, 200], [100, 300]);
    expect(onSwipe).not.toHaveBeenCalled();
    const top = render(<Harness onSwipe={onSwipe} scroll={TOP} />);
    swipe(top.getAllByTestId('box')[1], [100, 200], [100, 300]);
    expect(onSwipe).toHaveBeenCalledWith('down');
  });

  test('uses scroll position at touch start, not end', () => {
    const onSwipe = jest.fn();
    const { getByTestId } = render(<Harness onSwipe={onSwipe} scroll={MIDDLE} />);
    const box = getByTestId('box');
    fireEvent.touchStart(box, { touches: [{ clientX: 100, clientY: 300 }] });
    setScroll(getByTestId('scroller'), BOTTOM);
    fireEvent.touchEnd(box, { changedTouches: [{ clientX: 100, clientY: 200 }] });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  test('missing ref counts as top and bottom', () => {
    const onSwipe = jest.fn();
    const { getByTestId } = render(<Harness onSwipe={onSwipe} withRef={false} />);
    swipe(getByTestId('box'), [100, 300], [100, 200]);
    swipe(getByTestId('box'), [100, 200], [100, 300]);
    expect(onSwipe.mock.calls).toEqual([['up'], ['down']]);
  });

  test('taps and diagonal moves call nothing', () => {
    const onSwipe = jest.fn();
    const { getByTestId } = render(<Harness onSwipe={onSwipe} scroll={TOP} />);
    swipe(getByTestId('box'), [100, 100], [102, 101]);
    swipe(getByTestId('box'), [100, 100], [180, 180]);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
