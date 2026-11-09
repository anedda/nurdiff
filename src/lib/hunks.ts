import type { Hunk } from "../types";

export type { Hunk };

/** Mark in the overview bar: one or more nearby blocks merged together. */
export interface OverviewMark {
  /** Index of the first block represented (needed by the click). */
  index: number;
  start: number;
  end: number;
  kind: Hunk["kind"];
}

/**
 * Reduces the blocks to a limited number of marks: blocks that fall in the same
 * "slice" of the bar (`buckets` slices in all) become a single mark. It avoids
 * drawing tens of thousands of elements for files with a great many differences.
 */
export function overviewMarks(hunks: Hunk[], total: number, buckets = 800): OverviewMark[] {
  if (total <= 0) return [];
  const marks: OverviewMark[] = [];
  let lastBucket = -1;
  hunks.forEach((hunk, index) => {
    const bucket = Math.floor((hunk.start / total) * buckets);
    const last = marks[marks.length - 1];
    if (last && bucket === lastBucket) {
      last.end = Math.max(last.end, hunk.end);
      if (last.kind !== hunk.kind) last.kind = "changed";
    } else {
      marks.push({ index, start: hunk.start, end: hunk.end, kind: hunk.kind });
      lastBucket = bucket;
    }
  });
  return marks;
}

/**
 * Block closest to a position in the file, provided it is within `tolerance` rows; otherwise -1.
 * `row` is a continuous coordinate (row i occupies the range [i, i+1), like a click
 * on the overview) and the distance is measured from the range [start, end) of the block: 0 if it
 * falls inside. The blocks must be sorted by position.
 */
export function nearestHunk(hunks: Hunk[], row: number, tolerance: number): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    const distance = row < hunk.start ? hunk.start - row : row >= hunk.end ? row - hunk.end : 0;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    } else if (hunk.start > row) {
      break; // the following blocks are even further away
    }
  }
  return bestDistance <= tolerance ? best : -1;
}

/**
 * Index of the next block (direction = 1) or previous (-1), wrapping around.
 * `current` = -1 means that no block is selected yet.
 */
export function stepHunk(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
