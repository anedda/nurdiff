import type { Mark } from "../types";

export interface Segment {
  text: string;
  /** True if the part is among those that differ from the other side. */
  marked: boolean;
}

/**
 * Splits the text of a row into normal parts and highlighted parts. The ranges must be
 * sorted and non-overlapping; those outside the text or empty are ignored.
 * Without ranges it returns a single segment.
 */
export function splitByMarks(text: string, marks: Mark[] | undefined): Segment[] {
  if (!marks || marks.length === 0) return [{ text, marked: false }];
  const segments: Segment[] = [];
  let pos = 0;
  for (const mark of marks) {
    const start = Math.max(mark.start, pos);
    const end = Math.min(mark.end, text.length);
    if (end <= start) continue;
    if (start > pos) segments.push({ text: text.slice(pos, start), marked: false });
    segments.push({ text: text.slice(start, end), marked: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), marked: false });
  return segments.length > 0 ? segments : [{ text, marked: false }];
}

/** A range `[start, end)` of a line, in UTF-16 units. */
export interface Range {
  start: number;
  end: number;
}

export interface HitSegment extends Segment {
  /** The part is a search match (`current`: the one the search is on). */
  hit: "hit" | "current" | null;
}

/** The ranges that are not empty, by position: what the sweep of `splitWithHits` needs. */
function sorted<T extends Range>(ranges: readonly T[]): T[] {
  return ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
}

/**
 * Like `splitByMarks`, with also the search matches of the line: the text is cut wherever a mark or a match
 * starts or ends, so a part can be both (a difference that contains a match). `currentStart` is where the
 * current match starts in this line, if it is here. The marks and the matches do not overlap each in its own list;
 * a single pass over the cut points is enough (a line can have thousands of matches).
 */
export function splitWithHits(text: string, marks: Mark[] | undefined, hits: Range[], currentStart: number | null): HitSegment[] {
  const m = sorted(marks ?? []);
  const h = sorted(hits);
  const clip = (n: number) => Math.max(0, Math.min(text.length, n));
  const cuts = new Set<number>([0, text.length]);
  for (const r of [...m, ...h]) {
    cuts.add(clip(r.start));
    cuts.add(clip(r.end));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: HitSegment[] = [];
  let mi = 0;
  let hi = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (b <= a) continue;
    while (mi < m.length && m[mi].end <= a) mi++;
    while (hi < h.length && h[hi].end <= a) hi++;
    const hit = hi < h.length && h[hi].start <= a && h[hi].end >= b ? h[hi] : null;
    out.push({
      text: text.slice(a, b),
      marked: mi < m.length && m[mi].start <= a && m[mi].end >= b,
      hit: hit ? (hit.start === currentStart ? "current" : "hit") : null,
    });
  }
  return out.length > 0 ? out : [{ text, marked: false, hit: null }];
}
