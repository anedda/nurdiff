import type { DirScan, DirStats } from "../types";
import type { PreviewRow } from "./previewTree";
import type { PreviewMark } from "./previewPick";

/** The summary of the preview: like `DirStats`, plus the pairs of files not yet compared. */
export interface PreviewStats extends DirStats {
  notCompared: number;
}

const EMPTY: PreviewStats = { identical: 0, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0, notCompared: 0 };

/**
 * Counts the entries of the preview like the full comparison (`DirStats`: files and entries present on one
 * side only or of a different type, not the folders present on both sides), but only those read:
 * - entries on one side only and of a different type: seen from the listings, without comparing;
 * - pairs of files: equal or different if compared in place (different also if the core could not read
 *   them), otherwise "not compared" (even if the comparison is in progress or failed);
 * - folders present on both sides: if open the rows they contain are counted; if closed and
 *   already compared their summary is added up (`summaries`), otherwise it is not known what is inside.
 */
export function previewStats(rows: readonly PreviewRow[], marks: ReadonlyMap<string, PreviewMark>, summaries: ReadonlyMap<string, DirStats>): PreviewStats {
  const out = { ...EMPTY };
  const add = (s: DirStats) => {
    out.identical += s.identical;
    out.different += s.different;
    out.minor += s.minor;
    out.leftOnly += s.leftOnly;
    out.rightOnly += s.rightOnly;
    out.typeMismatch += s.typeMismatch;
  };
  for (const row of rows) {
    const { left, right } = row.pair;
    if (!left && !right) continue;
    if (!right) out.leftOnly += 1;
    else if (!left) out.rightOnly += 1;
    else if (left.kind !== right.kind) out.typeMismatch += 1;
    else if (left.kind === "dir") {
      const s = summaries.get(row.rel);
      if (!row.expanded && s) add(s);
    } else {
      const m = marks.get(row.rel);
      if (!countMark(out, m)) out.notCompared += 1;
    }
  }
  return out;
}

/** Adds a compared entry to `out` by its mark: `false` if the mark says nothing (missing, in progress, failed). */
function countMark(out: PreviewStats, m: PreviewMark | undefined): boolean {
  if (!m || typeof m !== "object") return false;
  if ("error" in m) {
    if (!m.unreadable) return false;
    out.different += 1;
    return true;
  }
  if (m.status === "identical") out.identical += 1;
  else {
    out.different += 1;
    if (m.minor) out.minor += 1;
  }
  return true;
}

/**
 * The summary with the scan: the counts of all the entries, also of closed folders. The entries on one
 * side only and of a different type come from the scan; the pairs of files compared in place (the marks
 * that are not of a folder, i.e. without a summary) are equal or different; the others are "not
 * compared". A folder of both sides that could not be read is different: the scan does not count it, nor what
 * it holds. If the scan stopped at the limit the counts are partial.
 */
export function scanStats(scan: DirScan, marks: ReadonlyMap<string, PreviewMark>, summaries: ReadonlyMap<string, DirStats>): PreviewStats {
  const out: PreviewStats = { ...EMPTY, leftOnly: scan.leftOnly, rightOnly: scan.rightOnly, typeMismatch: scan.typeMismatch };
  let compared = 0;
  for (const [rel, m] of marks) {
    if (summaries.has(rel)) {
      // A folder: only an unreadable one counts, and it was not among the pairs of the scan.
      if (typeof m === "object" && "error" in m && m.unreadable) out.different += 1;
      continue;
    }
    if (countMark(out, m)) compared += 1;
  }
  out.notCompared = Math.max(0, scan.filePairs - compared);
  return out;
}
