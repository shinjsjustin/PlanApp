const TRACKS_PER_CARD = 2;

export function columnsFor(widthPx, cardMinPx, gapPx) {
  return Math.max(1, Math.floor((widthPx + gapPx) / (cardMinPx + gapPx)));
}

// Start columns of a row's slots, ordered center-out, leftmost first on ties.
function centerOut(starts, columns) {
  return [...starts].sort((a, b) => Math.abs(a - columns) - Math.abs(b - columns) || a - b);
}

function rowStarts(rowIndex, columns) {
  const isOffset = rowIndex % 2 === 1;
  const slots = isOffset ? columns - 1 : columns;
  const first = isOffset ? 2 : 1;
  return Array.from({ length: slots }, (_, k) => first + TRACKS_PER_CARD * k);
}

export function layoutHoneycomb(count, columns) {
  if (columns === 1) {
    return Array.from({ length: count }, (_, i) => ({ row: i + 1, column: 1 }));
  }
  if (count < columns) {
    const starts = Array.from({ length: count }, (_, j) => columns - count + 1 + TRACKS_PER_CARD * j);
    return centerOut(starts, columns).map((column) => ({ row: 1, column }));
  }
  const cells = [];
  for (let row = 0; cells.length < count; row += 1) {
    const slots = centerOut(rowStarts(row, columns), columns);
    slots.slice(0, count - cells.length).forEach((column) => cells.push({ row: row + 1, column }));
  }
  return cells;
}
