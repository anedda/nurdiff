import type { Hunk, UnifiedSpan } from "../types";

/**
 * Position handover between the side-by-side and the unified view. The blocks of differences are the
 * same in the two views (`hunks` in side-by-side rows, `spans` in unified rows, same order):
 * outside the blocks the rows match one to one, a block takes more or fewer rows. A
 * position inside a block goes to the start of the block in the other view.
 */
export function splitToUnified(row: number, hunks: Pick<Hunk, "start" | "end">[], spans: UnifiedSpan[]): number {
  let shift = 0;
  for (let i = 0; i < hunks.length && i < spans.length; i++) {
    const h = hunks[i];
    if (row < h.start) break;
    if (row < h.end) return spans[i].start;
    shift += spans[i].end - spans[i].start - (h.end - h.start);
  }
  return Math.max(0, row + shift);
}

export function unifiedToSplit(line: number, hunks: Pick<Hunk, "start" | "end">[], spans: UnifiedSpan[]): number {
  let shift = 0;
  for (let i = 0; i < hunks.length && i < spans.length; i++) {
    const s = spans[i];
    if (line < s.start) break;
    if (line < s.end) return hunks[i].start;
    shift += s.end - s.start - (hunks[i].end - hunks[i].start);
  }
  return Math.max(0, line - shift);
}
