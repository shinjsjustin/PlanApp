import { columnsFor, layoutMasonry } from './masonry';

const columnsOf = ({ placements }) => placements.map((p) => p.column);

describe('columnsFor', () => {
  test('fits as many cards as the width allows', () => {
    expect(columnsFor(1100, 260, 16)).toBe(4);
  });

  test('never returns fewer than one column', () => {
    expect(columnsFor(0, 260, 16)).toBe(1);
    expect(columnsFor(200, 260, 16)).toBe(1);
  });
});

describe('layoutMasonry', () => {
  test('stacks cards in one column with a gap between them and none trailing', () => {
    const result = layoutMasonry({ heights: [10, 20, 30], columns: 1, containerWidth: 100, gapPx: 5 });
    expect(result.placements).toEqual([
      { column: 0, top: 0, left: 0, width: 100 },
      { column: 0, top: 15, left: 0, width: 100 },
      { column: 0, top: 40, left: 0, width: 100 },
    ]);
    expect(result.height).toBe(70);
  });

  test('fills equal-height cards center-out in 3 columns', () => {
    const result = layoutMasonry({ heights: [10, 10, 10], columns: 3, containerWidth: 300, gapPx: 0 });
    expect(columnsOf(result)).toEqual([1, 0, 2]);
  });

  test('fills equal-height cards center-out in 4 columns, left first on ties', () => {
    const result = layoutMasonry({ heights: [10, 10, 10, 10], columns: 4, containerWidth: 400, gapPx: 0 });
    expect(columnsOf(result)).toEqual([1, 2, 0, 3]);
  });

  test('sends the next card away from a tall card column', () => {
    const result = layoutMasonry({ heights: [100, 10, 10], columns: 2, containerWidth: 205, gapPx: 5 });
    expect(result.placements).toEqual([
      { column: 0, top: 0, left: 0, width: 100 },
      { column: 1, top: 0, left: 105, width: 100 },
      { column: 1, top: 15, left: 105, width: 100 },
    ]);
    expect(result.height).toBe(100);
  });

  test('centers the used columns when there are fewer cards than columns', () => {
    const result = layoutMasonry({ heights: [10, 10], columns: 4, containerWidth: 430, gapPx: 10 });
    expect(result.placements).toEqual([
      { column: 0, top: 0, left: 110, width: 100 },
      { column: 1, top: 0, left: 220, width: 100 },
    ]);
  });

  test('centers a single card among several columns', () => {
    const result = layoutMasonry({ heights: [10], columns: 3, containerWidth: 320, gapPx: 10 });
    expect(result.placements).toEqual([{ column: 0, top: 0, left: 110, width: 100 }]);
  });

  test('never produces a negative width', () => {
    const result = layoutMasonry({ heights: [10, 10], columns: 2, containerWidth: 0, gapPx: 10 });
    expect(result.placements.map((p) => p.width)).toEqual([0, 0]);
  });

  test('returns no placements and zero height for an empty list', () => {
    expect(layoutMasonry({ heights: [], columns: 3, containerWidth: 300, gapPx: 10 })).toEqual({
      placements: [],
      height: 0,
    });
  });
});
