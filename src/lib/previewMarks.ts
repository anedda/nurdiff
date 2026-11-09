import type { DirEntryDiff, DirStats } from "../types";
import type { PreviewMark } from "./previewPick";
import { statsOf } from "./tree";

/**
 * The preview marks after an in-place comparison of `rel` (with what it contains): the old
 * ones of the row and its descendants are removed and the new ones are put. Entries present on one
 * side only have no mark; an entry that could not be read has the "!" mark with `unreadable(reason)` (and
 * `unreadable: true` if it is on both sides).
 */
export function marksAfterCompare(
  marks: ReadonlyMap<string, PreviewMark>,
  rel: string,
  entries: readonly DirEntryDiff[],
  unreadable: (reason: string) => string = (reason) => reason,
): Map<string, PreviewMark> {
  const out = new Map(marks);
  for (const k of out.keys()) if (k === rel || k.startsWith(rel + "/")) out.delete(k);
  for (const e of entries) {
    // Of both sides it counts as different in the summaries; of one side it already counts as such.
    if (e.error) out.set(e.path, { error: unreadable(e.error), ...(e.leftKind && e.rightKind ? { unreadable: true as const } : {}) });
    else if (e.leftKind === null || e.rightKind === null) continue;
    else out.set(e.path, { status: e.status === "identical" ? "identical" : "different", ...(e.minor ? { minor: e.minor } : {}) });
  }
  return out;
}

/**
 * The summaries after the in-place comparison of `rel`: the folder and every folder present
 * on both sides that it contains have one (so the preview can also count the closed ones); for a file there
 * is none. The old summaries of the row and its descendants are removed. `swapped`: the sides were swapped
 * while the comparison ran, so only its new summaries are inverted (the others already were).
 */
export function statsAfterCompare(stats: ReadonlyMap<string, DirStats>, rel: string, entries: readonly DirEntryDiff[], swapped = false): Map<string, DirStats> {
  const out = new Map(stats);
  for (const k of out.keys()) if (k === rel || k.startsWith(rel + "/")) out.delete(k);
  for (const e of entries) {
    if (e.leftKind !== "dir" || e.rightKind !== "dir") continue;
    const s = statsOf(entries.filter((x) => x.path === e.path || x.path.startsWith(e.path + "/")));
    out.set(e.path, swapped ? { ...s, leftOnly: s.rightOnly, rightOnly: s.leftOnly } : s);
  }
  return out;
}

/** There is at least one comparison in progress: a row has the mark "…". */
export function anyBusy(marks: ReadonlyMap<string, unknown>): boolean {
  for (const v of marks.values()) if (v === "busy") return true;
  return false;
}

/** The summaries with swapped sides: "only on the left" and "only on the right" are exchanged. */
export function swapStats(stats: ReadonlyMap<string, DirStats>): Map<string, DirStats> {
  const out = new Map<string, DirStats>();
  for (const [k, s] of stats) out.set(k, { ...s, leftOnly: s.rightOnly, rightOnly: s.leftOnly });
  return out;
}
