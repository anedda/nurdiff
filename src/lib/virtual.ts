/**
 * Range of rows `[start, end)` to draw for a list with a fixed row height,
 * with a few extra rows above and below (`overscan`) to avoid flicker while scrolling.
 */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan = 8,
): [number, number] {
  if (total <= 0 || rowHeight <= 0) return [0, 0];
  const top = Math.max(0, scrollTop);
  const first = Math.floor(top / rowHeight);
  const last = Math.ceil((top + Math.max(0, viewportHeight)) / rowHeight);
  const end = Math.min(total, last + overscan);
  const start = Math.min(Math.max(0, first - overscan), end);
  return [start, end];
}

/** Scroll position that brings the row to the centre of the window, without going out of bounds. */
export function scrollTopForRow(
  row: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
): number {
  const centered = row * rowHeight - (viewportHeight - rowHeight) / 2;
  const max = Math.max(0, total * rowHeight - viewportHeight);
  return Math.min(Math.max(0, centered), max);
}
