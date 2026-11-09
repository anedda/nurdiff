// Mirror of the types serialized by nurdiff-core (serde, camelCase).
// The tests of crates/core (lib.rs, store.rs) check the field names: if they change, both must be updated.

export type Encoding = "utf8" | "utf8Bom" | "utf16Le" | "utf16Be" | "latin1";
export type Eol = "lf" | "crlf" | "cr" | "mixed" | "none";

export type RowKind = "equal" | "changed" | "leftOnly" | "rightOnly";

/** Range `[start, end)` of a row, in UTF-16 code units (like `String.slice`). */
export interface Mark {
  start: number;
  end: number;
}

export interface Cell {
  number: number;
  text: string;
  /** Parts that differ from the other side (modified rows); absent if there are none. */
  marks?: Mark[];
}

/** A match of a search: the row among those the view shows and the range in the line (UTF-16 units). */
export interface SearchHit {
  row: number;
  start: number;
  end: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** There are more matches than the core looks for. */
  truncated: boolean;
}

export interface Row {
  kind: RowKind;
  left: Cell | null;
  right: Cell | null;
  /** With a filter active: there are other hidden rows before this one. */
  gap?: boolean;
  /** The two rows are side by side by the user's choice (manual alignment). */
  aligned?: boolean;
}

/** A row of the unified view: equal, removed (only on the left) or added (only on the right). */
export interface UnifiedRow {
  kind: "equal" | "removed" | "added";
  /** Row number (from 1) on the left / on the right: missing for added / removed rows. */
  left?: number;
  right?: number;
  text: string;
  /** The row of the side-by-side view it comes from (index among the rows shown): what the copy of a row needs. */
  row: number;
  /** Parts that differ from the other side (rows that were a modified row). */
  marks?: Mark[];
  /** With a filter active: there are other hidden rows before this one. */
  gap?: boolean;
}

/** Where a block of differences is in the unified view: rows `[start, end)`. */
export interface UnifiedSpan {
  start: number;
  end: number;
}

/** How to pair the rows: Myers (the fewest different rows), Patience or Histogram. */
export type Algorithm = "myers" | "patience" | "histogram";

export const ALGORITHMS: { value: Algorithm; label: string; titleKey: string }[] = [
  { value: "myers", label: "Myers", titleKey: "algo.myers.title" },
  { value: "patience", label: "Patience", titleKey: "algo.patience.title" },
  { value: "histogram", label: "Histogram", titleKey: "algo.histogram.title" },
];

/** Which whitespace differences do not count: none, at the end of the line, only the amount, all. */
export type Whitespace = "none" | "trailing" | "amount" | "all";

/** `shortKey`: short label for the toolbar, where the menu is as wide as "Histogram". */
export const WHITESPACES: { value: Whitespace; labelKey: string; shortKey: string; titleKey: string }[] = [
  { value: "none", labelKey: "ws.none", shortKey: "ws.none.short", titleKey: "ws.none.title" },
  { value: "trailing", labelKey: "ws.trailing", shortKey: "ws.trailing.short", titleKey: "ws.trailing.title" },
  { value: "amount", labelKey: "ws.amount", shortKey: "ws.amount.short", titleKey: "ws.amount.title" },
  { value: "all", labelKey: "ws.all", shortKey: "ws.all.short", titleKey: "ws.all.title" },
];

/** Which rows the comparison shows: all, only the different ones, or the different ones with a little context. */
export type RowFilter = "all" | "diffs" | "context";

export interface DiffStats {
  equal: number;
  changed: number;
  leftOnly: number;
  rightOnly: number;
}

/** The rows of two files for the "Differences" column, or why they are not counted. */
export type LineCount = ({ kind: "lines" } & DiffStats) | { kind: "binary" } | { kind: "tooLarge" };

export interface FileInfo {
  encoding: Encoding;
  eol: Eol;
  lines: number;
}

/** Group of consecutive rows that are not equal (`end` is exclusive). */
export interface Hunk {
  start: number;
  end: number;
  /** Prevailing kind: it is used to colour the mark in the overview bar. */
  kind: "changed" | "leftOnly" | "rightOnly";
  /** Rows of each side before the block: where to insert a row that is missing at the start of the block. */
  leftAt: number;
  rightAt: number;
}

export type Mode = "files" | "dirs";

/** Type of a path (as Rust classifies it). */
export type PathKind = "file" | "dir" | "other" | "missing";

export type MergeDirection = "leftToRight" | "rightToLeft";
export type Side = "left" | "right";

/**
 * Comparison of two files open in Rust. The rows do not come here: they are requested in blocks
 * with `getRows(id, start, end)` and freed with `releaseDiff(id)`.
 */
export interface OpenedDiff {
  id: number;
  /** Changes at every merge or undo: the rows already received are no longer valid. */
  revision: number;
  /** There are merges not yet saved to the left / right file. */
  leftDirty: boolean;
  rightDirty: boolean;
  /** There is at least one merge to undo. */
  canUndo: boolean;
  /** The side cannot be modified or saved (git temporary copy, `/dev/null`). */
  leftReadOnly: boolean;
  rightReadOnly: boolean;
  /** True if the rows match according to the options (encoding and line ending may differ). */
  identical: boolean;
  totalRows: number;
  stats: DiffStats;
  left: FileInfo;
  right: FileInfo;
  hunks: Hunk[];
  /** Width of the longest row, in characters (a tab counts 4). */
  maxWidth: number;
  /** Rows of the unified view and position of each block (same order as `hunks`). */
  unifiedTotal: number;
  unifiedHunks: UnifiedSpan[];
  /** Manual alignments: pairs (left row, right row), from 1, in order. */
  aligns: [number, number][];
  /** Present if the texts differ (or are equal according to the options) only in minor things. */
  minor?: MinorCauses;
  /** The search for the smallest diff hit its limit: the diff is correct, but may have more changed lines than the minimum. */
  approximate?: boolean;
}

/** Why a difference is minor: line ending, encoding, trailing spaces, other spaces, case. */
export interface MinorCauses {
  eol: boolean;
  encoding: boolean;
  trailingSpace: boolean;
  whitespace: boolean;
  case: boolean;
}

/** Which files to compare, by extension (lowercase, without dot); see `ExtFilter` in the core. */
export interface ExtFilter {
  includeExts: string[];
  /** Also includes files without an extension. */
  includeNone: boolean;
  excludeExts: string[];
  /** Also excludes files without an extension. */
  excludeNone: boolean;
}

export type EntryKind = "file" | "dir" | "symlink" | "other";
/** An entry in the listing of a folder (without comparison). */
export interface DirListing {
  name: string;
  kind: EntryKind;
  size: number;
  modified: number | null;
}

export type EntryStatus =
  | "identical"
  | "different"
  | "leftOnly"
  | "rightOnly"
  | "typeMismatch"
  /** Only before the comparison (the map of the preview): on both sides, with the same type, not compared yet. */
  | "notCompared";

export interface DirEntryDiff {
  path: string;
  status: EntryStatus;
  leftKind: EntryKind | null;
  rightKind: EntryKind | null;
  leftSize: number | null;
  rightSize: number | null;
  /** Modification time in milliseconds since 1970. */
  leftModified: number | null;
  rightModified: number | null;
  /** Only for `different` files: present if the difference is only minor. */
  minor?: MinorCauses;
  /** The entry could not be read (the system text): it counts as different and a folder has no children. */
  error?: string;
}

/** The count of a scan of two folders (without reading the files), as in the core. */
export interface DirScan {
  leftOnly: number;
  rightOnly: number;
  typeMismatch: number;
  /** Pairs of files present on both sides, still to be compared. */
  filePairs: number;
  visited: number;
  /** The visit stopped at the limit: the counts are partial. */
  truncated: boolean;
}

export interface DirStats {
  identical: number;
  different: number;
  /** Among the `different` ones, those with only minor differences. */
  minor: number;
  leftOnly: number;
  rightOnly: number;
  typeMismatch: number;
}

export interface DirDiff {
  entries: DirEntryDiff[];
  stats: DirStats;
}

/** Comparison requested from the command line (git, `nurdiff-cli --gui`). */
export interface LaunchRequest {
  left: string;
  right: string;
  leftReadOnly: boolean;
  rightReadOnly: boolean;
}

/** What the "Report" menu can export from the foreground tab. */
export type ReportSource =
  | { kind: "file"; id: number; left: string; right: string }
  | { kind: "dirs"; diff: DirDiff; left: string; right: string };

/** What to put in place of a conflict (`git mergetool`). */
export type Resolution =
  | { kind: "unresolved" }
  | { kind: "ours" }
  | { kind: "theirs" }
  | { kind: "both" }
  | { kind: "bothReversed" }
  | { kind: "custom"; lines: string[] };

/** A piece of the file being resolved: lines without conflict, or a conflict with its two sides. */
export type ConflictSegment =
  | { kind: "text"; start: number; lines: string[] }
  | {
      kind: "conflict";
      /** Position among the conflicts (from 0). */
      index: number;
      /** Number of the first line of its result in the file as it is now. */
      start: number;
      oursLabel: string;
      theirsLabel: string;
      ours: string[];
      /** The common ancestor, if git wrote it (`merge.conflictStyle=diff3`). */
      base: string[] | null;
      theirs: string[];
      resolution: Resolution;
      /** The lines it gives to the file now (with the markers if unresolved). */
      result: string[];
    };

/** A file with conflict markers, as the UI receives it: freed with `releaseDiff(id)`. */
export interface ConflictView {
  id: number;
  path: string;
  segments: ConflictSegment[];
  total: number;
  unresolved: number;
  dirty: boolean;
  canUndo: boolean;
}
