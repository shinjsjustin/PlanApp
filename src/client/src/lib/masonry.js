export function columnsFor(widthPx, cardMinPx, gapPx) {
  return Math.max(1, Math.floor((widthPx + gapPx) / (cardMinPx + gapPx)));
}

// Used columns ordered center-out, leftmost first on ties.
function centerOut(usedColumns) {
  const middle = (usedColumns - 1) / 2;
  return Array.from({ length: usedColumns }, (_, c) => c).sort(
    (a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b,
  );
}

export function layoutMasonry({ heights, columns, containerWidth, gapPx }) {
  const usedColumns = Math.max(1, Math.min(columns, heights.length));
  const width = Math.max(0, (containerWidth - (columns - 1) * gapPx) / columns);
  const offset = ((columns - usedColumns) * (width + gapPx)) / 2;
  const order = centerOut(usedColumns);
  const running = new Array(usedColumns).fill(0);
  const counts = new Array(usedColumns).fill(0);

  const placements = heights.map((cardHeight) => {
    const column = order.reduce((best, c) => (running[c] < running[best] ? c : best), order[0]);
    const top = running[column];
    running[column] += cardHeight + gapPx;
    counts[column] += 1;
    return { column, top, left: offset + column * (width + gapPx), width };
  });

  const height = Math.max(0, ...running.map((h, c) => (counts[c] ? h - gapPx : 0)));
  return { placements, height };
}
