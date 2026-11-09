import type { DirEntryDiff } from "../types";
import type { MapLevel } from "./treemap";

/**
 * Separates the elements too small to be drawn on their own (area below `minArea` px² when
 * `total` weighs as much as the whole `area`) from those that stay. If the small ones are fewer than two they are not
 * grouped: a single small element stays as it is.
 */
export function splitSmall<T extends { value: number }>(items: T[], area: number, minArea: number): { big: T[]; small: T[] } {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (area <= 0 || total <= 0) return { big: items, small: [] };
  const limit = (total * minArea) / area;
  const small = items.filter((i) => i.value < limit);
  if (small.length < 2) return { big: items, small: [] };
  return { big: items.filter((i) => i.value >= limit), small };
}

/** The weight to draw the group of the small ones with: their sum, but enough to have a readable area. */
export function clusterValue(small: { value: number }[], total: number, area: number, minArea: number): number {
  const sum = small.reduce((a, i) => a + i.value, 0);
  return area <= 0 ? sum : Math.max(sum, (total * minArea) / area);
}

/** The counts by status of the files of a level of the map (the different ones include the minor differences). */
export interface LevelCounts {
  different: number;
  leftOnly: number;
  rightOnly: number;
  typeMismatch: number;
  identical: number;
  notCompared: number;
}

export function levelCounts(level: MapLevel): LevelCounts {
  const out: LevelCounts = { different: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0, identical: 0, notCompared: 0 };
  const add = (e: DirEntryDiff) => {
    out[e.status === "different" ? "different" : e.status] += 1;
  };
  for (const f of level.files) add(f.entry);
  for (const g of level.groups) for (const l of g.leaves) add(l.entry);
  return out;
}
