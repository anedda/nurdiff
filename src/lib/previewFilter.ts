import type { DirFilter } from "./tree";
import type { PairedEntry } from "./previewMerge";

/**
 * Before the comparison only what the listings say is known: which entries are on one side
 * only (orphans) and which have a different type. The filters that need the contents (equal,
 * different, minor, newer) are not available.
 */
const AVAILABLE: ReadonlySet<DirFilter> = new Set<DirFilter>([
  "all",
  "noOrphans",
  "orphans",
  "leftOrphans",
  "rightOrphans",
]);

export function isPreviewFilter(filter: DirFilter): boolean {
  return AVAILABLE.has(filter);
}

/** Whether an entry passes the filter (only the filters available in the preview; the others let none through). */
export function previewMatches(pair: PairedEntry, filter: DirFilter): boolean {
  const { left, right } = pair;
  switch (filter) {
    case "all": return true;
    case "orphans": return (left === null) !== (right === null);
    case "leftOrphans": return left !== null && right === null;
    case "rightOrphans": return left === null && right !== null;
    case "noOrphans": return left !== null && right !== null;
    default: return false;
  }
}

/** The same filter after swapping the sides: "only on the left" becomes "only on the right", and vice versa. */
export function swapFilter(filter: DirFilter): DirFilter {
  if (filter === "leftOrphans") return "rightOrphans";
  if (filter === "rightOrphans") return "leftOrphans";
  return filter;
}

/**
 * The rows that remain with a filter: those that match and the folders that contain them.
 * `rows` is the list already laid out as a tree (each open folder before its children, with its
 * depth); closed folders have no children in the list, so they hide what they contain.
 */
export function filterRows<T extends { pair: PairedEntry; depth: number }>(rows: readonly T[], filter: DirFilter): T[] {
  if (filter === "all") return [...rows];
  const keep: boolean[] = new Array(rows.length).fill(false);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (previewMatches(rows[i].pair, filter)) keep[i] = true;
    if (!keep[i]) continue;
    // The ancestors: the preceding rows with lower depth, going up.
    let depth = rows[i].depth;
    for (let j = i - 1; j >= 0 && depth > 0; j--) {
      if (rows[j].depth < depth) {
        keep[j] = true;
        depth = rows[j].depth;
      }
    }
  }
  return rows.filter((_, i) => keep[i]);
}
