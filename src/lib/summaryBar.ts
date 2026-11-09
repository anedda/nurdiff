export interface RowStats {
  changed: number;
  leftOnly: number;
  rightOnly: number;
}

export type SegmentKey = "rightOnly" | "leftOnly" | "changed";

export interface Segment {
  key: SegmentKey;
  count: number;
  /** Share of the total of different rows, as a whole percentage (only for the tooltips). */
  pct: number;
}

/**
 * The segments of the summary bar: rows only on the right ("+"), only on the left ("−") and modified
 * ("~"), in this order. The bar shows the composition of the differences, not how much of the file is different:
 * the segments are proportional to each other. Empty ones are not there.
 */
export function barSegments(stats: RowStats): Segment[] {
  const total = stats.changed + stats.leftOnly + stats.rightOnly;
  const all: [SegmentKey, number][] = [
    ["rightOnly", stats.rightOnly],
    ["leftOnly", stats.leftOnly],
    ["changed", stats.changed],
  ];
  return all.filter(([, count]) => count > 0).map(([key, count]) => ({ key, count, pct: Math.round((count / total) * 100) }));
}

export interface DirSegment {
  key: "changed" | "leftOnly" | "rightOnly" | "typeMismatch";
  count: number;
  pct: number;
}

/**
 * The segments of the folder summary bar: different entries, only on the left, only on the right and of a different
 * type (in the order they appear in the pills). As with files, it shows the composition of the
 * differences: identical entries have no segment. Empty ones are not there.
 */
export function dirBarSegments(stats: { different: number; leftOnly: number; rightOnly: number; typeMismatch: number }): DirSegment[] {
  const all: [DirSegment["key"], number][] = [
    ["changed", stats.different],
    ["leftOnly", stats.leftOnly],
    ["rightOnly", stats.rightOnly],
    ["typeMismatch", stats.typeMismatch],
  ];
  const total = all.reduce((n, [, c]) => n + c, 0);
  return all.filter(([, count]) => count > 0).map(([key, count]) => ({ key, count, pct: Math.round((count / total) * 100) }));
}
