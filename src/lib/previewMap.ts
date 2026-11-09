import type { DirEntryDiff, EntryKind, Side } from "../types";
import type { PairedEntry } from "./previewMerge";
import type { PreviewMark } from "./previewPick";
import { key, type DirSize, type PreviewRow } from "./previewTree";

type Half = NonNullable<PairedEntry["left"]>;

/** The size of one side of a row: the size of a file, the computed total of a folder (`null` while it is not known). */
function sizeOf(entry: Half | null, side: Side, rel: string, sizes: Readonly<Record<string, DirSize>>): number | null {
  if (!entry) return null;
  if (entry.kind !== "dir") return entry.size;
  const total = sizes[key(side, rel)];
  return typeof total === "number" ? total : null;
}

/**
 * The rows of the preview as entries for the map: what the listings say is certain (only on one side, or a different
 * type) keeps its status; what is on both sides with the same type is `notCompared` until it is compared in place:
 * then it takes the result from its mark (a folder too: the core gives it "different" if anything inside differs).
 * The sizes of the folders are those computed so far, so the cells grow as the results arrive.
 */
export function previewMapEntries(
  rows: readonly PreviewRow[],
  sizes: Readonly<Record<string, DirSize>>,
  marks: ReadonlyMap<string, PreviewMark> = new Map(),
): DirEntryDiff[] {
  return rows.map((row) => {
    const { left, right } = row.pair;
    const kind = (e: Half | null): EntryKind | null => (e ? e.kind : null);
    const mark = marks.get(row.rel);
    // A comparison in progress or failed says nothing; one the core could not read is different, as in the list.
    const compared =
      mark && typeof mark === "object"
        ? "status" in mark
          ? { status: mark.status, minor: mark.minor }
          : mark.unreadable
            ? { status: "different" as const }
            : null
        : null;
    const bothSame = left && right && left.kind === right.kind;
    return {
      path: row.rel,
      status: !left ? "rightOnly" : !right ? "leftOnly" : !bothSame ? "typeMismatch" : (compared?.status ?? "notCompared"),
      ...(bothSame && compared?.minor ? { minor: compared.minor } : {}),
      leftKind: kind(left),
      rightKind: kind(right),
      leftSize: sizeOf(left, "left", row.rel, sizes),
      rightSize: sizeOf(right, "right", row.rel, sizes),
      leftModified: left?.modified ?? null,
      rightModified: right?.modified ?? null,
    };
  });
}
