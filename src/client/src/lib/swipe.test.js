import { classifySwipe, SWIPE_MIN_PX, DOMINANCE } from './swipe';

describe('classifySwipe', () => {
  test('exports thresholds', () => {
    expect(SWIPE_MIN_PX).toBe(50);
    expect(DOMINANCE).toBe(1.5);
  });

  test.each([
    [{ dx: -60, dy: 0 }, 'left'],
    [{ dx: 60, dy: 0 }, 'right'],
    [{ dx: 0, dy: -60 }, 'up'],
    [{ dx: 0, dy: 60 }, 'down'],
    [{ dx: 51, dy: 10 }, 'right'],
    [{ dx: 50, dy: 0 }, null],
    [{ dx: -50, dy: 0 }, null],
    [{ dx: 0, dy: 50 }, null],
    [{ dx: 0, dy: 0 }, null],
    [{ dx: 90, dy: 60 }, null],
    [{ dx: 90, dy: 59 }, 'right'],
    [{ dx: 60, dy: 90 }, null],
    [{ dx: 59, dy: -90 }, 'up'],
    [{ dx: 60, dy: 60 }, null],
  ])('%j -> %s', (move, expected) => {
    expect(classifySwipe(move)).toBe(expected);
  });
});
