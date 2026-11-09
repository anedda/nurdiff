import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareDirectories,
  compareFiles,
  type CompareOptions,
  confirmDiscard,
  inTauri,
  pickPath,
  revealInFolder,
  releaseDiff,
} from "./api";
import { useT } from "./i18n/context";
import { describeError } from "./i18n";
import DirDiffView from "./components/DirDiffView";
import DirPreview from "./components/DirPreview";
import DropOverlay from "./components/DropOverlay";
import ModeChooser from "./components/ModeChooser";
import WorkspaceControls from "./components/WorkspaceControls";
import FileDiffView from "./components/FileDiffView";
import { baseName } from "./lib/drop";
import { EMPTY_EXT_FILTER } from "./lib/extFilter";
import { anyBusy } from "./lib/previewMarks";
import type { PreviewList } from "./lib/previewTree";
import { runsOnPick } from "./lib/settings";
import { canCompareRow, joinPath } from "./lib/tree";
import { useFileOps, useFileOptions } from "./lib/useFileOps";
import { useChannel } from "./lib/channel";
import { useCompareCancel } from "./lib/useCompareCancel";
import { useExclusive } from "./lib/useExclusive";
import { useDirRows, type DirView } from "./lib/useDirRows";
import { usePreviewMarks } from "./lib/usePreviewMarks";
import { useWindowDrop } from "./lib/useWindowDrop";
import type { ViewMode } from "./components/ViewSwitch";
import { useSettings } from "./settingsContext";
import type { DirDiff, DirEntryDiff, ExtFilter, Mode, OpenedDiff, ReportSource, Side } from "./types";

/** What a tab shows when it opens. */
export interface WorkspaceStart {
  mode: Mode;
  left: string;
  right: string;
  /** Run the comparison right away. */
  run: boolean;
  /** Sides that cannot be modified (temporary copies made by git): they apply to these two paths. */
  readOnly?: { left: boolean; right: boolean };
  /** Tab it was opened from (the folder comparison this file is part of). */
  origin?: number;
}

export interface WorkspaceInfo {
  title: string;
  /** There are unsaved merges. */
  dirty: boolean;
  /** The last successful comparison: it is used to avoid opening the same one twice. */
  compared: { mode: Mode; left: string; right: string } | null;
  /** What can be exported from the "Report" menu, if there is a comparison. */
  report: ReportSource | null;
  /** The folder comparison shown (the sidebar lists its files). */
  dir: { diff: DirDiff; left: string; right: string } | null;
  /** The folder preview (before the comparison): the sidebar lists its content. */
  preview: PreviewList | null;
}

interface WorkspaceProps {
  /** The tab is the visible one: only it responds to dragging and shortcuts. */
  active: boolean;
  start?: WorkspaceStart;
  /** A comparison succeeded: the Home uses it for the list of recent ones. */
  onCompared: (mode: Mode, left: string, right: string) => void;
  onInfo: (info: WorkspaceInfo) => void;
  /** Double click on a file in the folder list: it opens in a new tab. */
  onOpenFiles: (left: string, right: string) => void;
  /** Opens the comparison of two folders in a new tab (from the preview). */
  onOpenDirs: (left: string, right: string) => void;
  /** Request from the sidebar: compare these two files in this tab (`id` changes at every request). */
  navigateTo?: { id: number; left: string; right: string } | null;
  /** Request from the sidebar: open or close a folder of the preview (`id` changes at every request). */
  previewToggle?: { id: number; rel: string } | null;
  /** Where the sidebar shows the list of differences (null = closed or on another view). */
  sidebarSlot: HTMLElement | null;
}

function titleFor(left: string, right: string): string {
  const [a, b] = [baseName(left), baseName(right)];
  return a === b ? a : `${a} ↔ ${b}`;
}

export default function Workspace({
  active,
  start,
  onInfo,
  onCompared,
  onOpenFiles,
  onOpenDirs,
  navigateTo,
  previewToggle,
  sidebarSlot,
}: WorkspaceProps) {
  // The type of comparison is chosen when the tab is opened (null = not chosen yet) and never changes.
  const [mode, setMode] = useState<Mode | null>(start?.mode ?? null);
  const [left, setLeft] = useState(start?.left ?? "");
  const [right, setRight] = useState(start?.right ?? "");
  const [compared, setCompared] = useState<WorkspaceInfo["compared"]>(null);
  const [title, setTitle] = useState(
    start && start.left && start.right ? titleFor(start.left, start.right) : "",
  );
  const settings = useSettings();
  const t = useT();
  const fileOptions = useFileOptions(settings);
  const { ignoreCase, ignoreWhitespace, algorithm, rowFilter } = fileOptions;

  // One operation at a time (comparison, merge, save).
  const { busy, error, setError, working, exclusive } = useExclusive(t);
  // A notice that is not an error: "Comparison cancelled".
  const [note, setNote] = useState<string | null>(null);
  const onCancelled = () => setNote(t("ws.cancelled"));
  const [fileDiff, setFileDiff] = useState<OpenedDiff | null>(null);
  // Identifier of the comparison that Rust keeps in memory: the previous one must be freed.
  const openId = useRef<number | null>(null);
  // Changes at every new file comparison (not after a merge): the view starts again from the beginning.
  const [resetKey, setResetKey] = useState(0);
  const [dirView, setDirView] = useState<DirView | null>(null);
  // How the folders are shown (side by side or map): the same in the preview and in the comparison.
  const [dirViewMode, setDirViewMode] = useState<ViewMode>("split");
  // Folders loaded but not yet compared (drag or "Browse…" without immediate comparison).
  const [preview, setPreview] = useState<{ left: string; right: string } | null>(
    start && !start.run && start.mode === "dirs" && (start.left || start.right)
      ? { left: start.left, right: start.right }
      : null,
  );

  // Which files to compare, by extension: it applies to the preview and to the next folder comparison.
  const [extFilter, setExtFilter] = useState<ExtFilter>(EMPTY_EXT_FILTER);

  // The folder comparisons of this tab: Cancel (and Esc) stop only them.
  const channel = useChannel("tab");
  // Folder preview: the chosen row and the marks of the in-place comparisons.
  const pv = usePreviewMarks(preview, working, t, onCancelled, extFilter, channel);
  const setPreviewSel = pv.setSel; // extracted for the effects: it is stable, `pv` changes at every render
  const previewTarget =
    mode === "dirs" && !dirView && preview && pv.sel?.kind && left.trim() === preview.left && right.trim() === preview.right
      ? pv.sel
      : null;

  // Folder comparison: the chosen row, the provisional marks and the rows compared again.
  const dirRows = useDirRows(dirView, setDirView, working, t, onCancelled, channel);
  // Rows opened in a new tab: on returning to this tab they are compared again (the file may have been saved).
  const openedRows = useRef<Set<string>>(new Set());
  const rowEntry = dirView && dirRows.sel !== null ? dirView.diff.entries.find((e) => e.path === dirRows.sel) : undefined;
  // The button compares the row only if the fields are still the compared folders.
  const rowTarget =
    mode === "dirs" && dirView && rowEntry && canCompareRow(rowEntry) && left.trim() === dirView.left && right.trim() === dirView.right
      ? rowEntry
      : null;

  /** Compares a row in place: in the folder comparison or in the preview. */
  function compareRow(rel: string) {
    setNote(null);
    if (!dirView && preview) return pv.compare(rel);
    return dirRows.compare(rel);
  }

  /** "Show in file manager": opens the file manager; if it cannot, it says so. */
  function reveal(path: string) {
    revealInFolder(path).catch((e) => setError(describeError(e, t)));
  }

  /** Opens the row (file or folder) in a new tab. */
  function openRow(entry: DirEntryDiff) {
    if (dirView) openPath(dirView.left, dirView.right, entry.path, entry.leftKind === "dir" ? "dir" : "file");
  }
  function openPath(l: string, r: string, rel: string, kind: "file" | "dir") {
    // Only the rows already compared in place are compared again on return (in the preview there is nothing else to update).
    if (dirView || pv.marks.has(rel)) openedRows.current.add(rel);
    (kind === "dir" ? onOpenDirs : onOpenFiles)(joinPath(l, rel), joinPath(r, rel));
  }

  // Back on this tab, the rows opened elsewhere are compared again.
  useEffect(() => {
    if (!active || openedRows.current.size === 0) return;
    const rows = [...openedRows.current];
    openedRows.current.clear();
    for (const rel of rows) void latest.current.compareRow(rel);
  }, [active]);

  async function run() {
    if (mode) await runWith(mode, left, right);
  }


  /** Compares the two paths in the given mode (even if the state is not yet updated). */
  async function runWith(
    m: Mode,
    l: string,
    r: string,
    extra?: { options?: CompareOptions; readOnly?: { left: boolean; right: boolean }; aligns?: [number, number][]; filter?: ExtFilter },
  ) : Promise<boolean> {
    // The read-only sides (git) also apply to a new comparison of the same paths.
    const ro =
      extra?.readOnly ??
      (start?.readOnly && start.left === l.trim() && start.right === r.trim() ? start.readOnly : undefined);
    const options = extra?.options ?? { ignoreCase, ignoreWhitespace, algorithm };
    setError(null);
    setNote(null);
    if (!l.trim() || !r.trim()) {
      setError(t("ws.err.bothPaths"));
      return false;
    }
    if (!inTauri) {
      setError(t("ws.err.browser"));
      return false;
    }
    if (m === "files" && fileDiff && (fileDiff.leftDirty || fileDiff.rightDirty)) {
      const proceed = await confirmDiscard(
        t("ws.confirm.discard"),
        t,
      );
      if (!proceed) return false;
    }
    const done = await exclusive(async () => {
      if (m === "files") {
        const aligns = extra?.aligns ?? [];
        const opened = await compareFiles(l.trim(), r.trim(), options, ro, rowFilter, aligns);
        if (aligns.length > 0 && opened.aligns.length === 0) {
          setError(t("ws.err.aligns"));
        }
        const previous = openId.current;
        openId.current = opened.id;
        setFileDiff(opened);
        setResetKey((k) => k + 1);
        if (previous !== null) releaseDiff(previous).catch(() => {});
        setTitle(titleFor(l.trim(), r.trim()));
      } else {
        const filter = extra?.filter ?? extFilter;
        const diff = await compareDirectories(l.trim(), r.trim(), filter, channel);
        if (diff === null) {
          // Cancelled: the previous view stays (the preview or the previous comparison).
          onCancelled();
          return false;
        }
        setDirView({ diff, left: l.trim(), right: r.trim(), filter });
        setExtFilter(filter);
        dirRows.reset();
        openedRows.current.clear();
        setPreview(null);
        setTitle(titleFor(l.trim(), r.trim()));
      }
      return true;
    });
    // A comparison made with git temporary files makes no sense to reopen.
    if (done) setCompared({ mode: m, left: l.trim(), right: r.trim() });
    if (done && !ro) onCompared(m, l.trim(), r.trim());
    return !!done;
  }

  const [previewList, setPreviewList] = useState<PreviewList | null>(null);
  const dirty = !!fileDiff && (fileDiff.leftDirty || fileDiff.rightDirty);
  const fileId = fileDiff?.id;
  const report = useMemo<ReportSource | null>(() => {
    if (mode === "files" && fileId !== undefined && compared)
      return { kind: "file", id: fileId, left: compared.left, right: compared.right };
    if (mode === "dirs" && dirView) return { kind: "dirs", diff: dirView.diff, left: dirView.left, right: dirView.right };
    return null;
  }, [mode, fileId, compared, dirView]);
  // The caller can pass a new function at every render: only the content matters.
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;
  useEffect(() => {
    onInfoRef.current({ title, dirty, compared, report, dir: dirView, preview: previewList });
  }, [title, dirty, compared, report, dirView, previewList]);

  // The sidebar asks to open another file in this tab.
  const navigated = useRef(0);
  useEffect(() => {
    if (!navigateTo || navigateTo.id === navigated.current) return;
    navigated.current = navigateTo.id;
    const { left: l, right: r } = navigateTo;
    // The fields change only if the comparison starts (it can be cancelled because of unsaved changes).
    void latest.current.runWith("files", l, r).then((ok) => {
      if (ok) {
        setLeft(l);
        setRight(r);
      }
    });
  }, [navigateTo]);

  // When the tab is closed the comparison open in Rust must be freed.
  useEffect(
    () => () => {
      if (openId.current !== null) releaseDiff(openId.current).catch(() => {});
    },
    [],
  );

  // A tab opened with two paths compares them right away.
  const started = useRef(false);
  useEffect(() => {
    if (!start?.run || started.current) return;
    started.current = true;
    void latest.current.runWith(start.mode, start.left, start.right);
  }, [start]);

  // --- Dragging files and folders onto the window ---

  // The event handler is registered only once: it reads the most recent state from here.
  const latest = useRef({ compareRow, mode, left, right, runWith, setMode, setLeft, setRight, active, settings, showPreview, t });
  latest.current = { compareRow, mode, left, right, runWith, setMode, setLeft, setRight, active, settings, showPreview, t };

  // Folder comparison in progress: the blue button (after half a second) and Esc cancel it.
  const anyRunning = busy || anyBusy(pv.marks) || anyBusy(dirRows.marks);
  const { state: compareState, requestCancel } = useCompareCancel({
    active,
    channel,
    isDirs: mode === "dirs",
    running: anyRunning,
    hasPick: dirView ? dirRows.sel !== null : pv.sel !== null,
    clearPick: () => (dirView ? dirRows.setSel(null) : setPreviewSel(null)),
  });
  const drag = useWindowDrop(latest, working, setError);

  const {
    merge,
    mergeOneRow,
    mergeRowBlock,
    edit,
    locate,
    undo,
    align,
    unalign,
    removeAligns,
    save,
    swapFiles,
    refreshFiles,
    toggleIgnoreCase,
    changeWhitespace,
    changeAlgorithm,
    changeFilter,
  } = useFileOps({
    fileDiff,
    setFileDiff,
    compared,
    exclusive,
    runWith,
    options: fileOptions,
    setLeft,
    setRight,
    restartView: () => setResetKey((k) => k + 1),
  });

  /** Swaps the two folders of the preview without comparing them: the marks already computed stay (equal/different does not depend on the side), the "only on the left/right" counts are exchanged. */
  function swapPreview() {
    if (!preview) return;
    const { left: l, right: r } = preview;
    setLeft(r);
    setRight(l);
    setPreview({ left: r, right: l });
    pv.swapSides();
  }

  /** Shows the content of the chosen folders in place of the previous comparison (it does not compare them). */
  function showPreview(l: string, r: string) {
    pv.reset();
    openedRows.current.clear();
    setDirView(null);
    setPreview({ left: l.trim(), right: r.trim() });
  }

  async function browse(side: Side) {
    setError(null);
    if (!inTauri) {
      setError(t("ws.err.pickerApp"));
      return;
    }
    try {
      const picked = await pickPath(mode === "dirs");
      if (picked) {
        (side === "left" ? setLeft : setRight)(picked);
        const [l, r] = side === "left" ? [picked, right] : [left, picked];
        if (runsOnPick(settings, mode ?? "files") && l.trim() && r.trim()) await runWith(mode ?? "files", l, r);
        else if (mode === "dirs") showPreview(l, r);
      }
    } catch (e) {
      setError(describeError(e, t));
    }
  }

  // Files with automatic comparison: the button is only needed if the paths have not already been compared
  // (typed by hand, or before the first comparison). Enter in the fields compares anyway.
  const showCompare =
    mode !== "files" ||
    !settings.compareFilesOnDrop ||
    !compared ||
    compared.left !== left.trim() ||
    compared.right !== right.trim();

  /**
   * The swap between the fields: if there is a comparison or a preview of the typed paths it swaps them
   * (redoing the comparison, except in the preview); if the fields were changed by hand, or there is
   * nothing to show, it only swaps the texts.
   */
  function swapPaths() {
    const [l, r] = [left.trim(), right.trim()];
    if (mode === "files" && fileDiff && compared && compared.left === l && compared.right === r) return swapFiles();
    if (mode === "dirs" && dirView && dirView.left === l && dirView.right === r) {
      setLeft(dirView.right);
      setRight(dirView.left);
      void runWith("dirs", dirView.right, dirView.left, { filter: dirView.filter });
      return;
    }
    if (mode === "dirs" && !dirView && preview && preview.left === l && preview.right === r) return swapPreview();
    setLeft(right);
    setRight(left);
  }

  return (
    <div className="app">
      {mode === null && <ModeChooser onPick={setMode} />}

      {mode !== null && (
        <WorkspaceControls
          mode={mode}
          left={left}
          right={right}
          onLeft={setLeft}
          onRight={setRight}
          onRun={() => void run()}
          onBrowse={(side) => void browse(side)}
          onSwap={swapPaths}
          busy={busy}
          action={
            previewTarget
              ? { kind: "row", rel: previewTarget.rel }
              : rowTarget
                ? { kind: "row", rel: rowTarget.path }
                : showCompare
                  ? { kind: "compare" }
                  : null
          }
          onCompareRow={(rel) => void compareRow(rel)}
          compare={compareState}
          onCancel={requestCancel}
          options={mode === "files" && !fileDiff ? fileOptions : null}
        />
      )}

      {drag && <DropOverlay drag={drag} />}
      {error && <p className="error">{error}</p>}
      {note && (
        <p className="notice" role="status">
          {note}
        </p>
      )}
      <div className="results">
        {mode === "files" && fileDiff && (
          <FileDiffView
            diff={fileDiff}
            resetKey={resetKey}
            busy={busy}
            onMerge={merge}
            onMergeRow={mergeOneRow}
            onMergeRows={mergeRowBlock}
            onUndo={undo}
            onAlign={align}
            onUnalign={unalign}
            onClearAligns={removeAligns}
            onEdit={edit}
            onLocate={locate}
            onSave={save}
            active={active}
            rowFilter={rowFilter}
            onFilter={(f) => void changeFilter(f)}
            ignoreCase={ignoreCase}
            ignoreWhitespace={ignoreWhitespace}
            onWhitespace={(v) => void changeWhitespace(v)}
            onToggleIgnoreCase={() => void toggleIgnoreCase()}
            algorithm={algorithm}
            onAlgorithm={(a) => void changeAlgorithm(a)}
            onRefresh={refreshFiles}
            sidebarSlot={sidebarSlot}
          />
        )}
        {mode === "dirs" && !dirView && preview && (
          <DirPreview
            view={dirViewMode}
            onView={setDirViewMode}
            left={preview.left}
            right={preview.right}
            selected={pv.sel}
            onSelect={pv.setSel}
            marks={pv.marks}
            summaries={pv.stats}
            busy={busy}
            onCompareRow={(rel) => void compareRow(rel)}
            onOpenRow={(rel, kind) => openPath(preview.left, preview.right, rel, kind)}
            onReveal={reveal}
            onRefreshed={pv.clearResults}
            extFilter={extFilter}
            onExtFilter={setExtFilter}
            onList={setPreviewList}
            toggleRequest={previewToggle}
          />
        )}
        {mode === "dirs" && dirView && (
          <DirDiffView
            view={dirViewMode}
            onView={setDirViewMode}
            diff={dirView.diff}
            onOpenRow={openRow}
            roots={{ left: dirView.left, right: dirView.right }}
            onReveal={reveal}
            selected={dirRows.sel}
            onSelect={dirRows.setSel}
            onCompareRow={(rel) => void compareRow(rel)}
            marks={dirRows.marks}
            keep={dirRows.keep}
            onFilterChange={dirRows.clearKeep}
            initialFilter={settings.dirFilter}
            busy={busy}
            onRefresh={() => void runWith("dirs", dirView.left, dirView.right, { filter: dirView.filter })}
            extFilter={dirView.filter}
            onExtFilter={(f) => void runWith("dirs", dirView.left, dirView.right, { filter: f })}
          />
        )}
      </div>
    </div>
  );
}
