/** Moving tabs with the mouse: the logic, without DOM, so it can be tested. */

/** Minimum distance (px) beyond which a click becomes a drag. */
export const DRAG_THRESHOLD = 5;

/**
 * Where the dragged tab would land: how many of the other tabs (excluding the Home, without the tab itself)
 * have their centre to the left of the pointer. With `centers` in order from left to right.
 */
export function dropSlot(centers: number[], x: number): number {
  let slot = 0;
  for (const c of centers) {
    if (c < x) slot += 1;
    else break;
  }
  return slot;
}

/** Moves the tab `id` to the position `slot` among the tabs that are not the Home, which stays first. */
export function moveTab<T extends { id: number; home?: boolean }>(tabs: T[], id: number, slot: number): T[] {
  const moving = tabs.find((t) => t.id === id);
  if (!moving || moving.home) return tabs;
  const home = tabs.filter((t) => t.home);
  const others = tabs.filter((t) => !t.home && t.id !== id);
  const at = Math.max(0, Math.min(others.length, slot));
  others.splice(at, 0, moving);
  return [...home, ...others];
}
