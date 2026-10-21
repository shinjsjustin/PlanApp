export function columnsFor(widthPx, cardMinPx, gapPx) {
  return Math.max(1, Math.floor((widthPx + gapPx) / (cardMinPx + gapPx)));
}

export function layoutMasonry({ heights, columns, containerWidth, gapPx }) {
  const usedColumns = Math.max(1, Math.min(columns, heights.length));
  const width = Math.max(0, (containerWidth - (columns - 1) * gapPx) / columns);
  const running = new Array(usedColumns).fill(0);
  const counts = new Array(usedColumns).fill(0);

  const placements = heights.map((cardHeight) => {
    const column = running.indexOf(Math.min(...running));
    const top = running[column];
    running[column] += cardHeight + gapPx;
    counts[column] += 1;
    return { column, top, left: column * (width + gapPx), width };
  });

  const height = Math.max(0, ...running.map((h, c) => (counts[c] ? h - gapPx : 0)));
  return { placements, height };
}
