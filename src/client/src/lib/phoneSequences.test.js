import { buildSequenceGrid, stepSequence, initialSequenceId } from './phoneSequences';

const layers = [
  { id: 2, position: 2 },
  { id: 1, position: 1 },
  { id: 3, position: 3 },
];
const sequences = [
  { id: 20, layerId: 2, position: 1 },
  { id: 12, layerId: 1, position: 2 },
  { id: 11, layerId: 1, position: 1 },
  { id: 99, layerId: 3 + 1, position: 1 },
];

describe('buildSequenceGrid', () => {
  it('orders rows and sequences by position and skips empty layers', () => {
    const grid = buildSequenceGrid(layers, sequences);
    expect(grid.map((r) => r.layer.id)).toEqual([1, 2]);
    expect(grid[0].sequences.map((s) => s.id)).toEqual([11, 12]);
    expect(grid[1].sequences.map((s) => s.id)).toEqual([20]);
  });
});

describe('stepSequence', () => {
  const grid = buildSequenceGrid(layers, sequences);
  it.each([
    [11, 'left', 12],
    [12, 'left', 12],
    [12, 'right', 11],
    [11, 'right', 11],
    [12, 'up', 20],
    [20, 'up', 20],
    [20, 'down', 11],
    [11, 'down', 11],
  ])('from %i %s gives %i', (id, dir, expected) => {
    expect(stepSequence(grid, id, dir)).toBe(expected);
  });
  it('returns the initial id for an unknown current id', () => {
    expect(stepSequence(grid, 555, 'left')).toBe(11);
  });
});

describe('initialSequenceId', () => {
  const grid = buildSequenceGrid(layers, sequences);
  it('keeps a remembered id that is in the grid', () => {
    expect(initialSequenceId(grid, 20)).toBe(20);
  });
  it('falls back to the first sequence', () => {
    expect(initialSequenceId(grid, 555)).toBe(11);
    expect(initialSequenceId(grid, null)).toBe(11);
  });
  it('returns null for an empty grid', () => {
    expect(initialSequenceId([], 3)).toBeNull();
  });
});
