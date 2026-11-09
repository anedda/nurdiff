import type { Translate } from "../i18n";
import type { DiffStats, DirEntryDiff } from "../types";
import { formatSize } from "./format";

/** The count of a row: pending, non-text file, too large to count, error, or the result. */
export type DiffCount = "loading" | "binary" | "large" | "error" | DiffStats;

/** Above this size (of either file) the rows are not counted: `MAX_TEXT_BYTES` of the core (a test keeps them
 * equal). The core decides; with it the UI does not even ask for files it already knows are too large. */
export const MAX_COUNT_BYTES = 16 * 1024 * 1024;

/** One of the two files is too large to count its rows, by the sizes of the comparison. */
export function tooLargeToCount(e: DirEntryDiff): boolean {
  return (e.leftSize ?? 0) > MAX_COUNT_BYTES || (e.rightSize ?? 0) > MAX_COUNT_BYTES;
}

/** The count to show for an entry: "large" without asking if the sizes already say so. */
export function countOf(e: DirEntryDiff, counts: Readonly<Record<string, DiffCount>>): DiffCount | undefined {
  return tooLargeToCount(e) ? "large" : counts[countKey(e)];
}

/** A count without a number (pending, not text, too large, failed): the sign and its tooltip. `null` for a result. */
export function countSign(count: DiffCount | undefined, t: Translate): { text: string; title: string; busy?: true } | null {
  if (count === undefined || count === "loading") return { text: "…", title: t("dir.diffCount.loading"), busy: true };
  if (count === "binary") return { text: "—", title: t("dir.diffCount.binary") };
  if (count === "large") return { text: "—", title: t("dir.diffCount.large", { size: formatSize(MAX_COUNT_BYTES) }) };
  if (count === "error") return { text: "!", title: t("dir.diffCount.error") };
  return null;
}

/** Different rows: the modified ones (counted once) plus those present on one side only. */
export function diffLineCount(stats: DiffStats): number {
  return stats.changed + stats.leftOnly + stats.rightOnly;
}

/** Only the files present on both sides and different are counted (not folders or one-side entries). */
export function needsCount(e: DirEntryDiff): boolean {
  return e.status === "different" && e.leftKind === "file" && e.rightKind === "file";
}

/** Key of the result: it changes if the file changes (size or date), so a repeated comparison does not use an old one. */
export function countKey(e: DirEntryDiff): string {
  return [e.path, e.leftSize, e.rightSize, e.leftModified, e.rightModified].join("\0");
}
