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

// Directions name the finger's motion: left reveals the next sequence in the
// row, up reveals the next layer down. A layer change lands on the row's first.
export function stepSequence(grid, currentId, direction) {
  const rowIndex = grid.findIndex((row) => row.sequences.some((s) => s.id === currentId));
  if (rowIndex === -1) return initialSequenceId(grid, null);

  const ids = grid[rowIndex].sequences.map((s) => s.id);
  const colIndex = ids.indexOf(currentId);
  const rowDelta = { up: 1, down: -1 }[direction];
  if (rowDelta) {
    const target = grid[rowIndex + rowDelta];
    return target ? target.sequences[0].id : currentId;
  }
  const colDelta = { left: 1, right: -1 }[direction] ?? 0;
  return ids[colIndex + colDelta] ?? currentId;
}
