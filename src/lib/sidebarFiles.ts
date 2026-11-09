import type { DirEntryDiff } from "../types";
import { isDirEntry, type TreeRow } from "./tree";

/** All the folders of the comparison: what "expand all" opens in the sidebar tree. */
export function allFolders(entries: DirEntryDiff[]): Set<string> {
  return new Set(entries.filter(isDirEntry).map((e) => e.path));
}

/** An entry that can be opened as a file comparison: an ordinary file on both sides. */
export function comparable(e: DirEntryDiff): boolean {
  return e.leftKind === "file" && e.rightKind === "file";
}

/** The rows of the tree that can be opened as a file comparison, in the order they are seen. */
export function comparableRows(rows: TreeRow[]): TreeRow[] {
  return rows.filter((r) => !r.isDir && comparable(r.entry));
}

/**
 * Path of `full` relative to `root`, with `/` as separator, or null if it is not inside `root`.
 * It accepts both `/` and `\` and ignores the trailing slashes of `root`.
 */
export function relativeTo(root: string, full: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, "/");
  const base = norm(root).replace(/\/+$/, "");
  const path = norm(full);
  if (!path.startsWith(base + "/")) return null;
  return path.slice(base.length + 1);
}
