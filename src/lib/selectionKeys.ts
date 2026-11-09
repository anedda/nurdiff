import { useEffect, useState } from "react";

/** How many rows PageUp/PageDown moves: those of the visible window minus one (at least one). */
export function pageRows(viewportHeight: number, rowHeight: number): number {
  return Math.max(1, Math.floor(viewportHeight / rowHeight) - 1);
}

/**
 * The selected row after a movement key (arrows, PageUp/PageDown, Home, End), starting from `cur`
 * (-1 = none), without limiting it to `[0, total)`. `undefined` if the key does not move the selection.
 */
export function nextSelection(key: string, cur: number, page: number, total: number): number | undefined {
  switch (key) {
    case "ArrowDown":
      return cur + 1;
    case "ArrowUp":
      return cur < 0 ? 0 : cur - 1;
    case "PageDown":
      return cur + page;
    case "PageUp":
      return cur - page;
    case "Home":
      return 0;
    case "End":
      return total - 1;
    default:
      return undefined;
  }
}

/**
 * The scroll that brings the row `row` into view with the least movement: the row at the top if it is above the
 * window, at the bottom if it is below (taking `allowance` into account, the horizontal scroll bar).
 */
export function revealScrollTop(current: number, clientHeight: number, row: number, rowHeight: number, allowance: number): number {
  const top = row * rowHeight;
  if (top < current) return top;
  if (top + rowHeight > current + clientHeight - allowance) return top + rowHeight - clientHeight + allowance;
  return current;
}

/**
 * A row can leave the visible window (and the loaded rows) while it is selected: it remembers the last
 * copy that arrived for the same `key` (row and comparison), so whoever shows it does not stay empty.
 */
export function useHeldRow<T>(live: T | undefined, key: string): T | undefined {
  const [held, setHeld] = useState<{ key: string; row: T } | null>(null);
  useEffect(() => {
    if (live === undefined) return;
    setHeld((h) => (h && h.key === key && h.row === live ? h : { key, row: live }));
  }, [live, key]);
  return live ?? (held?.key === key ? held.row : undefined);
}
