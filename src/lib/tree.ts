import type { DirDiff, DirEntryDiff, DirStats, EntryStatus } from "../types";

/**
 * Filters: All / Diffs / Same, plus Minor (files that differ only in minor things: line ending, spaces, case, encoding).
 */
export type DirFilter =
  | "all" | "diffs" | "same" | "minor"
  | "noOrphans" | "diffsNoOrphans" | "orphans" | "leftOrphans" | "rightOrphans"
  | "leftNewer" | "rightNewer";

export interface TreeRow {
  entry: DirEntryDiff;
  name: string;
  depth: number;
  isDir: boolean;
  expanded: boolean;
}

/** Orphan: present on one side only (a different type is not one: both sides exist). */
export function isOrphan(e: DirEntryDiff): boolean {
  return e.status === "leftOnly" || e.status === "rightOnly";
}

/** Whether an entry passes the filter (without the text to search). */
export function matchesFilter(e: DirEntryDiff, filter: DirFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "diffs": return e.status !== "identical";
    case "same": return e.status === "identical";
    case "minor": return isMinor(e);
    case "noOrphans": return !isOrphan(e);
    case "diffsNoOrphans": return !isOrphan(e) && e.status !== "identical";
    case "orphans": return isOrphan(e);
    case "leftOrphans": return e.status === "leftOnly";
    case "rightOrphans": return e.status === "rightOnly";
    case "leftNewer": return newerSide(e) === "left";
    case "rightNewer": return newerSide(e) === "right";
  }
}

/** File that differs only in minor things (the core gives the causes in `minor`). */
export function isMinor(e: DirEntryDiff): boolean {
  return e.status === "different" && !isDirEntry(e) && !!e.minor;
}

/** The status as the interface shows it: the core status, with the minor differences apart. */
export type StatusKind = EntryStatus | "minor";

export function statusKind(e: DirEntryDiff): StatusKind {
  return isMinor(e) ? "minor" : e.status;
}

/** The CSS status classes of an entry (`different minor`, `leftOnly`…): the colour is decided in `src/styles/A0-toolbar-restyle.css`, in one place only. */
export function statusClass(e: DirEntryDiff): string {
  return isMinor(e) ? `${e.status} minor` : e.status;
}

export function isDirEntry(e: DirEntryDiff): boolean {
  return e.leftKind === "dir" || e.rightKind === "dir";
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** On opening, the folders that contain differences are shown; the identical ones stay closed. */
export function defaultExpanded(entries: DirEntryDiff[]): Set<string> {
  const open = new Set<string>();
  for (const e of entries) {
    if (isDirEntry(e) && e.status !== "identical") open.add(e.path);
  }
  return open;
}

/**
 * The rows to show. `entries` is the flat list of the core: sorted by path, with every
 * folder before its children. With a filter or a text to search, the entries that
 * match and the folders that contain them remain; closed folders hide their children.
 */
export function visibleRows(
  entries: DirEntryDiff[],
  expanded: ReadonlySet<string>,
  filter: DirFilter,
  pattern: string,
  /** Entries that stay visible even if the filter would exclude them (those just compared again). */
  keep?: ReadonlySet<string>,
): TreeRow[] {
  const needle = pattern.trim().toLowerCase();
  const matches = (e: DirEntryDiff): boolean => {
    if (!matchesFilter(e, filter) && !keep?.has(e.path)) return false;
    if (needle && !nameOf(e.path).toLowerCase().includes(needle)) return false;
    return true;
  };

  // From the end: children come before their parent, which is shown if it has a visible one.
  const shown = new Array<boolean>(entries.length);
  const needed = new Set<string>();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const show = matches(e) || needed.has(e.path);
    shown[i] = show;
    if (show) needed.add(parentOf(e.path));
  }

  const rows: TreeRow[] = [];
  let closed: string | null = null; // closed folder whose children are skipped
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (closed !== null) {
      if (e.path.startsWith(closed + "/")) continue;
      closed = null;
    }
    if (!shown[i]) continue;
    const isDir = isDirEntry(e);
    const open = isDir && expanded.has(e.path);
    if (isDir && !open) closed = e.path;
    rows.push({ entry: e, name: nameOf(e.path), depth: e.path.split("/").length - 1, isDir, expanded: open });
  }
  return rows;
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The marker in the middle of the row: "≠" for files with different content, for entries of a different
 * type and for folders that contain differences (the core marks them "different"). Entries
 * present on one side only do not have it: the empty other half already says everything. Identical entries
 * have "=", drawn like the ≠ but in the text colour. Files that differ only in minor things
 * have "≈".
 */
export function diffMark(e: DirEntryDiff): "≠" | "=" | "≈" | "" {
  if (isMinor(e)) return "≈";
  if (e.status === "different" || e.status === "typeMismatch") return "≠";
  return e.status === "identical" ? "=" : "";
}

/** For a different file present on both sides: which one has the more recent modification date. */
export function newerSide(e: DirEntryDiff): "left" | "right" | null {
  if (e.status !== "different" || e.leftKind !== "file" || e.rightKind !== "file") return null;
  if (e.leftModified == null || e.rightModified == null || e.leftModified === e.rightModified) return null;
  return e.leftModified > e.rightModified ? "left" : "right";
}

/** Joins the root folder and the relative path (with `/`) using the separator of the root. */
export function joinPath(root: string, rel: string): string {
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const base = root.replace(/[\\/]+$/, "");
  return base + sep + (sep === "\\" ? rel.replace(/\//g, "\\") : rel);
}

/** Total size of a folder: the sum of the files it contains, on each side (null if the folder is missing). */
export interface DirTotals {
  left: number | null;
  right: number | null;
}

/**
 * The total sizes of every folder in the flat list of the core (which contains all the descendants):
 * the files of each side are added up over all the ancestor folders. A link does not count.
 */
export function dirTotals(entries: DirEntryDiff[]): Map<string, DirTotals> {
  const totals = new Map<string, DirTotals>();
  for (const e of entries) {
    if (e.leftKind === "dir" || e.rightKind === "dir") {
      totals.set(e.path, { left: e.leftKind === "dir" ? 0 : null, right: e.rightKind === "dir" ? 0 : null });
    }
  }
  for (const e of entries) {
    for (const side of ["left", "right"] as const) {
      const kind = side === "left" ? e.leftKind : e.rightKind;
      const size = side === "left" ? e.leftSize : e.rightSize;
      if (kind !== "file" || size == null) continue;
      let at = e.path;
      for (let i = at.lastIndexOf("/"); i > 0; i = at.lastIndexOf("/")) {
        at = at.slice(0, i);
        const t = totals.get(at);
        if (t && t[side] !== null) t[side] = (t[side] as number) + size;
      }
    }
  }
  return totals;
}

/** The statistics of a list, counted as in the core: folders present on both sides do not count. */
export function statsOf(entries: DirEntryDiff[]): DirStats {
  const stats: DirStats = { identical: 0, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0 };
  for (const e of entries) {
    if (e.leftKind === "dir" && e.rightKind === "dir" && !e.error) continue; // an unreadable one counts
    if (e.status === "notCompared") continue; // only in the preview: the core has no such status
    stats[e.status] += 1;
    if (isMinor(e)) stats.minor += 1;
  }
  return stats;
}

/** Where to insert the entry `path` that was not there: after the siblings that precede it (name order) and their children. */
function insertionIndex(entries: DirEntryDiff[], path: string): number {
  const parent = parentOf(path);
  const name = nameOf(path);
  let start = 0;
  let end = entries.length;
  if (parent) {
    const at = entries.findIndex((e) => e.path === parent);
    if (at < 0) return entries.length;
    start = at + 1;
    end = start;
    while (end < entries.length && entries[end].path.startsWith(parent + "/")) end++;
  }
  for (let i = start; i < end; i++) {
    const e = entries[i];
    if (parentOf(e.path) === parent && nameOf(e.path) > name) return i;
  }
  return end;
}

/**
 * Replaces in the comparison the entry `rel` (with its descendants) with those just computed: `updated`
 * is the core's list for that entry (empty if it no longer exists). The folders that contain it are
 * re-evaluated — identical if all the direct children are, otherwise different, as in the core — and the
 * statistics are recounted. The comparison passed in does not change.
 */
export function applyEntries(diff: DirDiff, rel: string, updated: DirEntryDiff[]): DirDiff {
  const inside = (p: string) => p === rel || p.startsWith(rel + "/");
  const first = diff.entries.findIndex((e) => inside(e.path));
  const rest = diff.entries.filter((e) => !inside(e.path));
  const at = first >= 0 ? first : insertionIndex(rest, rel);
  const entries = [...rest.slice(0, at), ...updated, ...rest.slice(at)];

  // The ancestor folders, from the closest to the root.
  for (let anc = parentOf(rel); anc !== ""; anc = parentOf(anc)) {
    const i = entries.findIndex((e) => e.path === anc);
    if (i < 0 || entries[i].leftKind !== "dir" || entries[i].rightKind !== "dir") continue;
    const same = entries.filter((e) => parentOf(e.path) === anc).every((e) => e.status === "identical");
    const status = same ? "identical" : "different";
    if (entries[i].status !== status) entries[i] = { ...entries[i], status };
  }
  return { entries, stats: statsOf(entries) };
}

/**
 * The core's answer to the in-place comparison of a folder that the extension filter empties: the folder alone,
 * readable and without children. The full comparison leaves such a folder out.
 */
export function emptiedByFilter(found: readonly DirEntryDiff[], filterActive: boolean): boolean {
  if (!filterActive || found.length !== 1) return false;
  const [e] = found;
  const dirOrNone = (k: DirEntryDiff["leftKind"]) => k === "dir" || k === null;
  return !e.error && dirOrNone(e.leftKind) && dirOrNone(e.rightKind);
}

/** Only an entry present on both sides can be compared in place (or opened in a tab), file with file or folder with folder. */
export function canCompareRow(e: DirEntryDiff): boolean {
  return e.leftKind !== null && e.leftKind === e.rightKind && (e.leftKind === "file" || e.leftKind === "dir");
}
