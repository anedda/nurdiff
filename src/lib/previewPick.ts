import type { EntryKind, MinorCauses } from "../types";

/** Mark of a preview row after "Compare selection": in progress, succeeded (equal/different) or failed. */
/** `unreadable`: the core compared the entry, present on both sides, but could not read it (it is different, as
 * in the full comparison); without it the comparison itself failed, or the entry is on one side only. */
export type PreviewMark = "busy" | { status: "identical" | "different"; minor?: MinorCauses } | { error: string; unreadable?: true };

/** The row chosen in the preview: `kind` is null if it cannot be compared (a side is missing or the types do not match). */
export interface PreviewSelection {
  rel: string;
  kind: "file" | "dir" | null;
}

/** The kind of comparison possible between two entries with the same name, or null. */
export function pairKind(left: EntryKind | null, right: EntryKind | null): "file" | "dir" | null {
  return left !== null && left === right && (left === "file" || left === "dir") ? left : null;
}
