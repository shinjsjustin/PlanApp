import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import useSwipe from './useSwipe';

function Harness({ onSwipe }) {
  const handlers = useSwipe({ onSwipe });
  return <div data-testid="box" {...handlers} />;
}

const swipe = (box, from, to) => {
  fireEvent.touchStart(box, { touches: [{ clientX: from[0], clientY: from[1] }] });
  fireEvent.touchEnd(box, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
};

describe('useSwipe', () => {
  test('horizontal swipes fire with finger direction', () => {
    const onSwipe = jest.fn();
    const { getByTestId } = render(<Harness onSwipe={onSwipe} />);
    swipe(getByTestId('box'), [200, 100], [100, 100]);
    swipe(getByTestId('box'), [100, 100], [200, 100]);
    expect(onSwipe.mock.calls).toEqual([['left'], ['right']]);
  });

  test('up and down swipes never call onSwipe', () => {
    const onSwipe = jest.fn();
    const { getByTestId } = render(<Harness onSwipe={onSwipe} />);
    swipe(getByTestId('box'), [100, 300], [100, 200]);
    swipe(getByTestId('box'), [100, 200], [100, 300]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  test('taps and diagonal moves call nothing', () => {
    const onSwipe = jest.fn();
    const { getByTestId } = render(<Harness onSwipe={onSwipe} />);
    swipe(getByTestId('box'), [100, 100], [102, 101]);
    swipe(getByTestId('box'), [100, 100], [180, 180]);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
