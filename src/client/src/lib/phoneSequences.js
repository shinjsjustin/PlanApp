import { sortByPosition } from './graph';

/** Rows of { layer, sequences } by position; layers with no sequences are skipped. */
export function buildSequenceGrid(layers, sequences) {
  return sortByPosition(layers)
    .map((layer) => ({
      layer,
      sequences: sortByPosition(sequences.filter((s) => s.layerId === layer.id)),
    }))
    .filter((row) => row.sequences.length > 0);
}

export function initialSequenceId(grid, rememberedId) {
  const ids = grid.flatMap((row) => row.sequences.map((s) => s.id));
  if (ids.includes(rememberedId)) return rememberedId;
  return ids[0] ?? null;
}

// Moves within the current row only; left reveals the next sequence. Any other
// direction (layer changes use layerNeighbours) leaves the current id.
export function stepSequence(grid, currentId, direction) {
  const rowIndex = grid.findIndex((row) => row.sequences.some((s) => s.id === currentId));
  if (rowIndex === -1) return initialSequenceId(grid, null);

  const ids = grid[rowIndex].sequences.map((s) => s.id);
  const colDelta = { left: 1, right: -1 }[direction] ?? 0;
  return ids[ids.indexOf(currentId) + colDelta] ?? currentId;
}

/** The rows above and below the one holding currentId; null at an edge or when not found. */
export function layerNeighbours(grid, currentId) {
  const i = grid.findIndex((row) => row.sequences.some((s) => s.id === currentId));
  if (i === -1) return { above: null, below: null };
  return { above: grid[i - 1] ?? null, below: grid[i + 1] ?? null };
}
