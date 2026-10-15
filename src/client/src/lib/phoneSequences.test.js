import { buildSequenceGrid, stepSequence, initialSequenceId, layerNeighbours } from './phoneSequences';

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
    [11, 'up', 11],
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

describe('layerNeighbours', () => {
  const fourLayers = [1, 2, 3, 4].map((id) => ({ id, position: id }));
  const seqs = [
    { id: 10, layerId: 1, position: 1 },
    { id: 20, layerId: 2, position: 1 },
    { id: 40, layerId: 4, position: 1 },
  ];
  const grid = buildSequenceGrid(fourLayers, seqs);

  it('gives above null for the top layer', () => {
    const { above, below } = layerNeighbours(grid, 10);
    expect(above).toBeNull();
    expect(below).toBe(grid[1]);
  });
  it('gives below null for the bottom layer, skipping the empty layer', () => {
    const { above, below } = layerNeighbours(grid, 40);
    expect(above).toBe(grid[1]);
    expect(below).toBeNull();
  });
  it('gives both for a middle layer, skipping the empty layer below it', () => {
    const { above, below } = layerNeighbours(grid, 20);
    expect(above.layer.id).toBe(1);
    expect(below.layer.id).toBe(4);
  });
  it('gives both null for an unknown id', () => {
    expect(layerNeighbours(grid, 555)).toEqual({ above: null, below: null });
  });
});
