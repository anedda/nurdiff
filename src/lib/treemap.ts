import type { DirEntryDiff } from "../types";
import { isDirEntry, matchesFilter } from "./tree";
import type { DirFilter } from "./tree";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placed<K> extends Rect {
  key: K;
}

/** The worst case of proportions (long side / short side) of a row of areas along the side `side`. */
function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/**
 * "Squarified" treemap: lays out the elements (`value` > 0, in decreasing order) inside `rect`, with areas
 * proportional to the values and cells as square as possible. The total area is that of `rect`.
 */
export function squarify<K>(items: { key: K; value: number }[], rect: Rect): Placed<K>[] {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (items.length === 0 || total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const areas = items.map((i) => i.value * scale);
  const out: Placed<K>[] = [];
  let { x, y, w, h } = rect;
  let start = 0;
  while (start < items.length) {
    const side = Math.min(w, h);
    let end = start + 1;
    while (end < items.length && worst(areas.slice(start, end + 1), side) <= worst(areas.slice(start, end), side)) end++;
    const row = areas.slice(start, end);
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      // The row is a column on the left, of width sum/h.
      const colW = sum / h;
      let cy = y;
      row.forEach((a, i) => {
        const ch = a / colW;
        out.push({ key: items[start + i].key, x, y: cy, w: colW, h: ch });
        cy += ch;
      });
      x += colW;
      w -= colW;
    } else {
      const rowH = sum / w;
      let cx = x;
      row.forEach((a, i) => {
        const cw = a / rowH;
        out.push({ key: items[start + i].key, x: cx, y, w: cw, h: rowH });
        cx += cw;
      });
      y += rowH;
      h -= rowH;
    }
    start = end;
  }
  return out;
}

/** A file of the map: the entry and the weight (the larger size of the two sides, at least 1 byte). */
export interface MapLeaf {
  entry: DirEntryDiff;
  value: number;
}

/** A folder of the map: the files it contains at any depth. */
export interface MapGroup {
  path: string;
  name: string;
  entry: DirEntryDiff | undefined;
  leaves: MapLeaf[];
  value: number;
}

export interface MapLevel {
  /** Files directly in the folder shown. */
  files: MapLeaf[];
  /** Subfolders with at least one visible file. */
  groups: MapGroup[];
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The entries drawn as cells: everything except folders (files and different types). */
export function isMapLeaf(e: DirEntryDiff): boolean {
  return !isDirEntry(e) || e.status === "typeMismatch";
}

/**
 * The contents of the folder `at` ("" = root) for the map: the files that pass the filter and the text (and
 * those of `keep`), grouped by first-level subfolder. The weight is the size in bytes;
 * empty files weigh 1 so they stay present. `foldersAsLeaves` (the map of the preview, where most folders are not
 * read): a folder with no entries inside is a cell of its own, weighing as much as its size (1 until it is known).
 */
export function mapLevel(
  entries: DirEntryDiff[],
  at: string,
  filter: DirFilter,
  pattern: string,
  keep?: ReadonlySet<string>,
  foldersAsLeaves = false,
): MapLevel {
  const needle = pattern.trim().toLowerCase();
  const withChildren = foldersAsLeaves ? new Set(entries.map((e) => e.path.slice(0, Math.max(0, e.path.lastIndexOf("/"))))) : null;
  const prefix = at === "" ? "" : at + "/";
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const files: MapLeaf[] = [];
  const groups = new Map<string, MapGroup>();
  for (const e of entries) {
    const leaf = isMapLeaf(e) || (withChildren !== null && isDirEntry(e) && !withChildren.has(e.path));
    if (!leaf || !e.path.startsWith(prefix)) continue;
    if (!matchesFilter(e, filter) && !keep?.has(e.path)) continue;
    if (needle && !nameOf(e.path).toLowerCase().includes(needle)) continue;
    const value = Math.max(e.leftSize ?? 0, e.rightSize ?? 0, 1);
    const rel = e.path.slice(prefix.length);
    const slash = rel.indexOf("/");
    if (slash < 0) {
      files.push({ entry: e, value });
      continue;
    }
    const name = rel.slice(0, slash);
    const path = prefix + name;
    let g = groups.get(path);
    if (!g) {
      g = { path, name, entry: byPath.get(path), leaves: [], value: 0 };
      groups.set(path, g);
    }
    g.leaves.push({ entry: e, value });
    g.value += value;
  }
  const bySize = (a: { value: number }, b: { value: number }) => b.value - a.value;
  files.sort(bySize);
  const list = [...groups.values()].sort(bySize);
  for (const g of list) g.leaves.sort(bySize);
  return { files, groups: list };
}
