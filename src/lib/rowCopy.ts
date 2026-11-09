import type { MergeDirection, Row, Side, UnifiedRow } from "../types";

/** Which way a row copy goes when it starts from `side`: the left row goes right, the right row goes left. */
export function rowCopyDirection(side: Side): MergeDirection {
  return side === "left" ? "leftToRight" : "rightToLeft";
}

/**
 * Whether the row of `side` can be copied to the other side: it must differ, have a line on this side (a row that exists
 * only on the other side has nothing to copy) and the other side must not be read-only.
 */
export function canCopyRow(row: Row | undefined, side: Side, readOnly: { left: boolean; right: boolean }): boolean {
  if (!row || row.kind === "equal") return false;
  if (!(side === "left" ? row.left : row.right)) return false;
  return !(side === "left" ? readOnly.right : readOnly.left);
}

/**
 * The direction a row of the unified view is copied: a removed row (a line of the left file) goes to the right, an added
 * one (a line of the right file) goes to the left; `null` if the row is equal, is not there yet or the destination side is
 * read-only.
 */
export function unifiedCopyDirection(row: UnifiedRow | undefined, readOnly: { left: boolean; right: boolean }): MergeDirection | null {
  if (!row || row.kind === "equal") return null;
  if (row.kind === "removed") return readOnly.right ? null : "leftToRight";
  return readOnly.left ? null : "rightToLeft";
}
