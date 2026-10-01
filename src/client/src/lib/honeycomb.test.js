import { columnsFor, layoutHoneycomb } from './honeycomb';

const asPairs = (cells) => cells.map(({ row, column }) => [row, column]);

describe('layoutHoneycomb', () => {
  test('stacks every card in column 1 when there is one column', () => {
    expect(asPairs(layoutHoneycomb(3, 1))).toEqual([[1, 1], [2, 1], [3, 1]]);
  });

  test('fills rows center-out and alternates offset rows', () => {
    expect(asPairs(layoutHoneycomb(7, 3))).toEqual([
      [1, 3], [1, 1], [1, 5], [2, 2], [2, 4], [3, 3], [3, 1],
    ]);
  });

  test('centers a single partial row', () => {
    expect(asPairs(layoutHoneycomb(1, 4))).toEqual([[1, 4]]);
    expect(asPairs(layoutHoneycomb(2, 4))).toEqual([[1, 3], [1, 5]]);
  });

  test('fills a full row center-out with ties to the left', () => {
    expect(asPairs(layoutHoneycomb(4, 4))).toEqual([[1, 3], [1, 5], [1, 1], [1, 7]]);
  });
});

describe('columnsFor', () => {
  test('fits as many cards as the width allows', () => {
    expect(columnsFor(1100, 260, 16)).toBe(4);
  });

  test('never returns fewer than one column', () => {
    expect(columnsFor(0, 260, 16)).toBe(1);
    expect(columnsFor(200, 260, 16)).toBe(1);
  });
});
