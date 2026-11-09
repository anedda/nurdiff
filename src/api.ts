import type { Translate } from "./i18n";
import { invoke } from "@tauri-apps/api/core";
import type {
  DirDiff,
  DirEntryDiff,
  DirListing,
  DirScan,
  LineCount,
  ExtFilter,
  ConflictView,
  LaunchRequest,
  Resolution,
  MergeDirection,
  OpenedDiff,
  PathKind,
  Row,
  RowFilter,
  SearchResult,
  Side,
  UnifiedRow,
  Algorithm,
  Whitespace,
} from "./types";

// True inside the Tauri app, false if the UI is opened in a normal browser (npm run dev).
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface CompareOptions {
  ignoreCase: boolean;
  ignoreWhitespace: Whitespace;
  algorithm: Algorithm;
}

export function compareFiles(
  left: string,
  right: string,
  opts: CompareOptions,
  readOnly: { left: boolean; right: boolean } = { left: false, right: false },
  rowFilter: RowFilter = "all",
  aligns: [number, number][] = [],
) {
  return invoke<OpenedDiff>("compare_files", {
    rowFilter,
    aligns,
    left,
    right,
    leftReadOnly: readOnly.left,
    rightReadOnly: readOnly.right,
    ignoreCase: opts.ignoreCase,
    ignoreWhitespace: opts.ignoreWhitespace,
    algorithm: opts.algorithm,
  });
}

/** Places by hand the row `left` of the left side next to the row `right` of the right side (numbers from 1). */
export function alignLines(id: number, left: number, right: number) {
  return invoke<OpenedDiff>("align_lines", { id, left, right });
}

/** Removes the manual alignment that goes through the row `left` of the left side (from 1). */
export function unalignLines(id: number, left: number) {
  return invoke<OpenedDiff>("unalign_lines", { id, left });
}

/** Removes all the manual alignments. */
export function clearAligns(id: number) {
  return invoke<OpenedDiff>("clear_aligns", { id });
}

/** Rows `[start, end)` of an open comparison (at most 5000 per request). */
export function getRows(id: number, start: number, end: number) {
  return invoke<Row[]>("get_rows", { id, start, end });
}

/**
 * Where `text` appears in the lines of a side (over the rows the view shows); the core stops at 10 000 matches. `null` if
 * a newer search on the same `channel` (or `cancelSearch`) stopped this one: the core looks at the whole file, and the
 * old search would keep the store busy for nothing.
 */
export function searchRows(id: number, side: Side, text: string, caseSensitive: boolean, channel: string) {
  return invoke<SearchResult | null>("search_rows", { id, side, text, caseSensitive, channel });
}

/** Stops the search of the channel that is still running (a new `searchRows` on the same channel does it too). */
export function cancelSearch(channel: string) {
  return invoke<void>("cancel_search", { channel });
}

/** Rows `[start, end)` of the unified view of an open comparison (at most 5000 per request). */
export function getUnifiedRows(id: number, start: number, end: number) {
  return invoke<UnifiedRow[]>("get_unified_rows", { id, start, end });
}

/** Copies the difference `hunk` (index in the list of blocks) from one side to the other. */
export function mergeHunk(id: number, hunk: number, direction: MergeDirection) {
  return invoke<OpenedDiff>("merge_hunk", { id, hunk, direction });
}

/** Copies the row `row` (index among those the view shows) from one side to the other. */
export function mergeRow(id: number, row: number, direction: MergeDirection) {
  return invoke<OpenedDiff>("merge_row", { id, row, direction });
}

/** Copies the block of rows `first..=last` (index among those the view shows) from one side to the other. */
export function mergeRows(id: number, first: number, last: number, direction: MergeDirection) {
  return invoke<OpenedDiff>("merge_rows", { id, first, last, direction });
}

/** Replaces `remove` rows of the side from `start` (from 0) with `lines`: edits, inserts or deletes. */
export function editLines(id: number, side: Side, start: number, remove: number, lines: string[]) {
  return invoke<OpenedDiff>("edit_lines", { id, side, start, remove, lines });
}

/** Index of the row of the view that shows the row `number` (from 1) of the side, if it exists. */
export function locateLine(id: number, side: Side, number: number) {
  return invoke<number | null>("locate_line", { id, side, number });
}

/** Changes the rows shown (all, only the different ones, with context): the merges and the files do not change. */
export function setRowFilter(id: number, filter: RowFilter) {
  return invoke<OpenedDiff>("set_row_filter", { id, filter });
}

/** Undoes the last merge or edit. */
export function undoMerge(id: number) {
  return invoke<OpenedDiff>("undo_merge", { id });
}

/** Saves a side to its file (it keeps the encoding and the line ending). */
export function saveSide(id: number, side: Side) {
  return invoke<OpenedDiff>("save_side", { id, side });
}

/** Asks for confirmation before discarding unsaved changes. */
export async function confirmDiscard(message: string, t: Translate): Promise<boolean> {
  if (!inTauri) return window.confirm(message);
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return confirm(message, {
    title: t("confirm.title"),
    kind: "warning",
    okLabel: t("confirm.discard"),
    cancelLabel: t("confirm.cancel"),
  });
}

/** Shows an error in a system window (used when there is no tab to show it in). */
export async function showError(message: string, t: Translate): Promise<void> {
  if (!inTauri) return window.alert(message);
  const { message: show } = await import("@tauri-apps/plugin-dialog");
  await show(message, { title: t("app.launch.errTitle"), kind: "error" });
}

/** Frees in Rust the memory of a comparison that is no longer needed. */
export function releaseDiff(id: number) {
  return invoke<void>("release_diff", { id });
}

/** The first level of a folder, without comparing it; the filter removes the files that do not pass. */
export function listDirectory(path: string, filter?: ExtFilter) {
  return invoke<DirListing[]>("list_directory", { path, filter });
}

/**
 * Cancels the size computations in progress on the channel and returns the epoch to use for the new ones. The
 * channel (`useChannel`) keeps the work of one component apart from the others.
 */
export function cancelDirectorySizes(channel: string) {
  return invoke<number>("cancel_directory_sizes", { channel });
}

/** Sum of the files in a folder (at any depth); null if cancelled by `cancelDirectorySizes`. */
export function directorySize(path: string, epoch: number, channel: string) {
  return invoke<number | null>("directory_size", { path, epoch, channel });
}

/** Equal, modified and one-side-only rows of two text files; `null` if they are not text files. */
export function fileDiffStats(left: string, right: string) {
  return invoke<LineCount>("file_diff_stats", { left, right });
}

/** Compares two folders; `null` if the comparison was cancelled by `cancelCompare` on the same channel. */
export function compareDirectories(left: string, right: string, filter: ExtFilter | undefined, channel: string) {
  return invoke<DirDiff | null>("compare_directories", { left, right, filter, channel });
}

/**
 * Compares an entry (and its children) again: `rel` is the relative path with `/`; the entry itself is
 * the first. `null` if the comparison was cancelled by `cancelCompare` on the same channel.
 */
export function recompareEntry(left: string, right: string, rel: string, filter: ExtFilter | undefined, channel: string) {
  return invoke<DirEntryDiff[] | null>("recompare_entry", { left, right, rel, filter, channel });
}

/** Cancels the scans in progress on the channel and returns the epoch to use for the new ones. */
export function cancelDirectoryScan(channel: string) {
  return invoke<number>("cancel_directory_scan", { channel });
}

/** Counts the entries of two folders without reading the files; `null` if cancelled by `cancelDirectoryScan`. */
export function scanDirectories(left: string, right: string, filter: ExtFilter | undefined, epoch: number, channel: string) {
  return invoke<DirScan | null>("scan_directories", { left, right, filter, epoch, channel });
}

/** Cancels the folder comparisons in progress on the channel (those that start afterwards are not touched). */
export function cancelCompare(channel: string) {
  return invoke<void>("cancel_compare", { channel });
}

/**
 * Opens the system file manager in the folder that contains `path`, with the entry highlighted where
 * the system allows it (otherwise only the folder is opened).
 */
export async function revealInFolder(path: string): Promise<void> {
  // Dynamic import, as for the picker: in the browser (npm run dev) the plugin is not needed.
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/** Opens the system file (or folder) picker. `null` if the user cancels. */
export async function pickPath(directory: boolean): Promise<string | null> {
  // Dynamic import: in the browser (npm run dev) the plugin is not needed and is not loaded.
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory, multiple: false });
  return typeof selected === "string" ? selected : null;
}

/** Type (file, folder, …) of each path, in the same order. */
export function classifyPaths(paths: string[]) {
  return invoke<PathKind[]>("classify_paths", { paths });
}

/** Drag event on the window; `x` and `y` are CSS pixels from the top-left corner. */
export type FileDragEvent =
  | { type: "enter"; paths: string[]; x: number; y: number }
  | { type: "over"; x: number; y: number }
  | { type: "drop"; paths: string[]; x: number; y: number }
  | { type: "leave" };

/**
 * Listens to the dragging of files onto the window. Returns the function that stops
 * listening. Tauri gives positions in physical pixels: here they are converted to CSS pixels.
 */
export async function onFileDrag(handler: (event: FileDragEvent) => void): Promise<() => void> {
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  const scale = window.devicePixelRatio || 1;
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "leave") handler({ type: "leave" });
    else if (p.type === "over") handler({ type: "over", x: p.position.x / scale, y: p.position.y / scale });
    else handler({ type: p.type, paths: p.paths, x: p.position.x / scale, y: p.position.y / scale });
  });
  return unlisten;
}

/** Comparison requested when the application starts (two paths on the command line), if any. */
export function launchRequest() {
  return invoke<LaunchRequest | null>("launch_request");
}

export type FileReportFormat = "html" | "unified";

/** Asks where to save a file (system dialog). Empty if the user cancels. */
export async function pickSavePath(
  defaultName: string,
  filterName: string,
  extensions: string[],
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: defaultName, filters: [{ name: filterName, extensions }] });
}

/** Writes the report of an open file comparison. `context`: rows around the differences, `null` = all. */
/** The texts (already translated) of the HTML page of the report: the core does not know languages. */
export interface FileReportLabels {
  lang: string;
  title: string;
  identical: string;
  /** Con `{changed}`, `{leftOnly}`, `{rightOnly}` y `{equal}`. */
  stats: string;
  /** Con `{count}`. */
  skipped: string;
  /** Con `{date}`. */
  generated: string;
  /** Shown when the comparison is approximate. */
  approximate: string;
}

export function exportFileReport(id: number, format: FileReportFormat, context: number | null, labels: FileReportLabels, path: string) {
  return invoke<void>("export_file_report", { id, format, context, labels, path });
}

/** The report of a file comparison as text (the one `exportFileReport` writes), to copy it. */
export function fileReportText(id: number, format: FileReportFormat, context: number | null, labels: FileReportLabels) {
  return invoke<string>("file_report_text", { id, format, context, labels });
}

// --- The configuration of the user (`~/.nurdiff`) ---

export type ConfigFile = "settings" | "recents" | "state";

/** The text of a configuration file, or null if it does not exist yet. */
export function loadConfig(file: ConfigFile) {
  return invoke<string | null>("load_config", { file });
}

export function saveConfig(file: ConfigFile, contents: string) {
  return invoke<void>("save_config", { file, contents });
}

/** Keeps a copy of the file as `.bak` (before the next saving replaces a content that could not be read). */
export function backupConfig(file: ConfigFile) {
  return invoke<void>("backup_config", { file });
}

/** The folder of the configuration, or null if there is no home folder. */
export function configPath() {
  return invoke<string | null>("config_path");
}

/** Writes a text file (UTF-8). */
export function writeTextFile(path: string, contents: string) {
  return invoke<void>("write_text_file", { path, contents });
}

// --- Window without the system bar (NurDiff draws the title bar) ---

export type ResizeEdge = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";

/** Commands on the window: all no-ops outside Tauri and never blocking for the interface. */
export async function windowCommand(
  cmd: "minimize" | "toggleMaximize" | "close" | "startDragging" | { resize: ResizeEdge },
): Promise<void> {
  if (!inTauri) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (typeof cmd === "object") await win.startResizeDragging(cmd.resize);
    else await win[cmd]();
  } catch (e) {
    console.error("window command failed", e);
  }
}

/**
 * Intercepts every request to close the window (NurDiff's button, Alt+F4, window
 * manager): if `allow` answers false the window stays open. A second request while the
 * question is still open is ignored. Returns the function to stop.
 */
export async function guardWindowClose(allow: () => Promise<boolean>): Promise<() => void> {
  if (!inTauri) return () => {};
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    let asking = false;
    return await getCurrentWindow().onCloseRequested(async (event) => {
      if (asking) {
        event.preventDefault();
        return;
      }
      asking = true;
      try {
        if (!(await allow())) event.preventDefault();
      } finally {
        asking = false;
      }
    });
  } catch (e) {
    console.error("close guard not active", e);
    return () => {};
  }
}

/** Shows or hides the system title bar. */
export async function setSystemTitleBar(on: boolean): Promise<void> {
  if (!inTauri) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setDecorations(on);
  } catch (e) {
    console.error("setDecorations failed", e);
  }
}

/** Notifies when the window is maximized or restored; returns the function to stop. */
export async function watchMaximized(onChange: (maximized: boolean) => void): Promise<() => void> {
  if (!inTauri) return () => {};
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const read = () => win.isMaximized().then(onChange, () => {});
    await read();
    return await win.onResized(() => void read());
  } catch {
    return () => {};
  }
}

/** What git does with NurDiff now (global configuration). */
export interface GitStatus {
  /** `git difftool` opens NurDiff. */
  configured: boolean;
  /** Plain `git diff` opens NurDiff too. */
  external: boolean;
  /** `git mergetool` opens NurDiff. */
  mergetool: boolean;
}

/** A setting written in the git configuration, with the value it replaced. */
export interface GitChange {
  key: string;
  value: string;
  old: string | null;
}

export function gitStatus() {
  return invoke<GitStatus>("git_status");
}

/** Sets git up to open NurDiff (`external`: also for plain `git diff`; `mergetool`: also for `git mergetool`). */
export function gitSetup(external: boolean, mergetool: boolean) {
  return invoke<GitChange[]>("git_setup", { external, mergetool });
}

/** Takes the NurDiff settings out of the git configuration: the keys removed. */
export function gitRemove() {
  return invoke<string[]>("git_remove");
}

/** The file to resolve if the app was started by `git mergetool` (`nurdiff --merge <file>`). */
export function mergeRequest() {
  return invoke<string | null>("merge_request");
}

/** Opens a file with conflict markers: its conflicts, to choose one by one. */
export function openConflicts(path: string) {
  return invoke<ConflictView>("open_conflicts", { path });
}

/** Chooses what goes in place of the conflict `index` (from 0). */
export function resolveConflict(id: number, index: number, resolution: Resolution) {
  return invoke<ConflictView>("resolve_conflict", { id, index, resolution });
}

export function undoConflicts(id: number) {
  return invoke<ConflictView>("undo_conflicts", { id });
}

/** Saves the file over itself (the conflicts without a choice stay with their markers). */
export function saveConflicts(id: number) {
  return invoke<ConflictView>("save_conflicts", { id });
}
