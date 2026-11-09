import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useCompactToolbar } from "../lib/useAutoCompact";
import type { ViewMode } from "./ViewSwitch";
import UnifiedPane from "./UnifiedPane";
import FileToolbar from "./FileToolbar";
import FileMeta from "./FileMeta";
import FilePane, { ROW_HEIGHT, SCROLLBAR_ALLOWANCE } from "./FilePane";
import { getRows, getUnifiedRows } from "../api";
import ContextMenu, { type ContextItem } from "./ContextMenu";
import HunkPanel from "./HunkPanel";
import LinePanel from "./LinePanel";
import { overviewMarks, type Hunk } from "../lib/hunks";
import { splitToUnified, unifiedToSplit } from "../lib/unifiedMap";
import { useRowChunks } from "../lib/useRowChunks";
import { useFileSearch } from "../lib/useFileSearch";
import { useRegisterCommands } from "../lib/commands";
import type { Range } from "../lib/segments";
import SearchBar from "./SearchBar";
import { nextSelection, pageRows, revealScrollTop, useHeldRow } from "../lib/selectionKeys";
import { useHunkNavigation } from "../lib/useHunkNavigation";
import { useLineEditing, type EditEnd, type LineEdit } from "../lib/useLineEditing";
import { useManualAlign, type PendingAlign } from "../lib/useManualAlign";
import { useOverviewPointer } from "../lib/useOverviewPointer";
import { copyToClipboard, selectedCodeText, selectedRows } from "../lib/copySelection";
import { useFlash } from "../lib/useFlash";
import { canCopyRow, rowCopyDirection, unifiedCopyDirection } from "../lib/rowCopy";
import { useSelectionPane } from "../lib/useSelectionPane";
import { useSelectionRows } from "../lib/useSelectionRows";
import { useScrollSync } from "../lib/useScrollSync";
import { scrollTopForRow, visibleRange } from "../lib/virtual";
import { useT } from "../i18n/context";
import { describeError } from "../i18n";
import type { Algorithm, MergeDirection, OpenedDiff, RowFilter, Side, UnifiedRow, Whitespace } from "../types";


interface FileDiffViewProps {
  diff: OpenedDiff;
  /** Changes at every new comparison (not after a merge): the view starts again from the beginning. */
  resetKey: number;
  busy: boolean;
  /** The operations return true if they succeeded (the error is shown by whoever runs them). */
  onMerge: (hunk: number, direction: MergeDirection) => Promise<boolean>;
  /** Copies one row (index among those shown) to the other side. */
  onMergeRow: (row: number, direction: MergeDirection) => Promise<boolean>;
  /** Copies a block of rows (`first..=last`, among those shown) to the other side. */
  onMergeRows: (first: number, last: number, direction: MergeDirection) => Promise<boolean>;
  onUndo: () => Promise<boolean>;
  /** Manual alignments: places two rows side by side (numbers from 1), removes one (by the left row) or all. */
  onAlign: (left: number, right: number) => Promise<boolean>;
  onUnalign: (left: number) => Promise<boolean>;
  onClearAligns: () => Promise<boolean>;
  /** Replaces `remove` rows of the side from `start` (from 0) with `lines` (edits, inserts, deletes). */
  onEdit: (side: Side, start: number, remove: number, lines: string[]) => Promise<boolean>;
  /** Index of the row of the view that shows the row `number` (from 1) of the side. */
  onLocate: (side: Side, number: number) => Promise<number | null>;
  onSave: (side: Side) => Promise<boolean>;
  /** The tab is visible: only then do the keyboard shortcuts apply. */
  active: boolean;
  rowFilter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  ignoreCase: boolean;
  ignoreWhitespace: Whitespace;
  onWhitespace: (whitespace: Whitespace) => void;
  onToggleIgnoreCase: () => void;
  algorithm: Algorithm;
  onAlgorithm: (algorithm: Algorithm) => void;
  /** Swaps the two sides and compares again / compares the same files again. */
  onRefresh: () => void;
  /** Where to draw the list of differences in the sidebar (null = not needed). */
  sidebarSlot: HTMLElement | null;
}

export default function FileDiffView({
  diff,
  resetKey,
  busy,
  onMerge,
  onMergeRow,
  onMergeRows,
  onUndo,
  onAlign,
  onUnalign,
  onClearAligns,
  onEdit,
  onLocate,
  onSave,
  active,
  rowFilter,
  onFilter,
  ignoreCase,
  ignoreWhitespace,
  onWhitespace,
  onToggleIgnoreCase,
  algorithm,
  onAlgorithm,
  onRefresh,
  sidebarSlot,
}: FileDiffViewProps) {
  // The normal bar switches by itself to the compact one when it does not fit on one row; a chosen compact one stays so.
  const { barRef, compact: compactToolbar } = useCompactToolbar();
  const t = useT();
  const { hunks, totalRows: total, maxWidth: width } = diff;
  const hasRows = total > 0;

  // Side-by-side or unified view. In the unified one the blocks are the same (same index) but take up
  // other rows: `vTotal` and `vHunks` are those of the view in use, for scrolling and the overview.
  const [view, setView] = useState<ViewMode>("split");
  const unified = view === "unified";
  const unifiedHunks = useMemo<Hunk[]>(
    () => (diff.unifiedHunks ?? []).map((span, i) => ({ ...hunks[i], start: span.start, end: span.end })),
    [diff.unifiedHunks, hunks],
  );
  const vTotal = unified ? (diff.unifiedTotal ?? 0) : total;
  const vHunks = unified ? unifiedHunks : hunks;
  const [uSelectedRaw, setUSelected] = useState<number | null>(null);
  const uSelected = uSelectedRaw !== null && uSelectedRaw < vTotal ? uSelectedRaw : null;
  const pendingScrollRow = useRef<number | null>(null);

  const marks = useMemo(() => overviewMarks(vHunks, vTotal), [vHunks, vTotal]);

  const [current, setCurrent] = useState(-1);
  // Selected row (index in the view) and side that was clicked: rows are selected
  // with a click or with the arrows, and the selection applies to both panes together.
  const [selected, setSelected] = useState<{ row: number; side: Side } | null>(null);
  const [loadError, setLoadError] = useState<{ error: unknown } | null>(null);
  // Manual alignment: the marked row (waiting for the other), the open menu and the notice
  // when a merge or an edit resets the alignments.
  const [pendingAlign, setPendingAlign] = useState<PendingAlign | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
  const [alignNote, setAlignNote] = useState(false);
  // Visible spaces and tabs in the panes (as already in the selected-row panel).
  const [showSpaces, setShowSpaces] = useState(false);
  // Position and height of the visible window; the two panes scroll together.
  const { leftRef, rightRef, scrollTop, viewportHeight, onLeftScroll, onRightScroll, resetScroll } = useScrollSync(ROW_HEIGHT, hasRows, unified);

  // Block to select when the result of a merge or an undo arrives
  // (-1 = none) and blocks merged recently, to reselect them on undo.
  const pendingSelect = useRef<number | null>(null);
  const merged = useRef<number[]>([]);

  // Row being edited (one at a time) and what to do when the new result arrives.
  const [editing, setEditing] = useState<LineEdit | null>(null);
  const editingRef = useRef<LineEdit | null>(null);
  editingRef.current = editing;
  const saveAfter = useRef(false);
  const endEditRef = useRef<(how: EditEnd) => Promise<void>>(async () => {});

  // New comparison: it starts again from the beginning.
  useEffect(() => {
    setCurrent(-1);
    setSelected(null);
    setUSelected(null);
    setLoadError(null);
    setPendingAlign(null);
    setMenu(null);
    setAlignNote(false);
    resetScroll();
    pendingSelect.current = null;
    merged.current = [];
    setEditing(null);
  }, [resetKey, resetScroll]);

  const { goTo, step, merge, undo, saveAll, tracked } = useHunkNavigation({
    diff,
    vHunks,
    vTotal,
    rowHeight: ROW_HEIGHT,
    busy,
    active,
    rightRef,
    current,
    setCurrent,
    pendingSelect,
    merged,
    saveAfter,
    editingRef,
    endEditRef,
    setAlignNote,
    onMerge,
    onUndo,
    onSave,
  });

  // The overview: a click jumps to the nearby block or to the point of the file, dragging it scrolls.
  const overview = useOverviewPointer({ scrollerRef: rightRef, hunks: vHunks, total: vTotal, rowHeight: ROW_HEIGHT, onGoTo: goTo });

  const [start, end] = visibleRange(scrollTop, viewportHeight, ROW_HEIGHT, vTotal);
  // Only the rows of the view in use are loaded (with a total of 0 the other asks for nothing).
  const rowAt = useRowChunks(diff.id, diff.revision, unified ? 0 : total, getRows, start, end, (error) => setLoadError({ error }));
  const unifiedAt = useRowChunks<UnifiedRow>(diff.id, diff.revision, unified ? vTotal : 0, getUnifiedRows, start, end, (error) => setLoadError({ error }));

  /** Changes view keeping the position: the top row moves to the corresponding row of the other view. */
  const switchView = (mode: ViewMode) => {
    if (mode === view) return;
    const el = rightRef.current;
    const top = el ? Math.floor(el.scrollTop / ROW_HEIGHT) : 0;
    const spans = diff.unifiedHunks ?? [];
    pendingScrollRow.current = mode === "unified" ? splitToUnified(top, hunks, spans) : unifiedToSplit(top, hunks, spans);
    editingRef.current = null;
    setEditing(null);
    setMenu(null);
    setView(mode);
  };
  useLayoutEffect(() => {
    const row = pendingScrollRow.current;
    pendingScrollRow.current = null;
    if (row === null) return;
    for (const el of [rightRef.current, leftRef.current]) if (el) el.scrollTop = row * ROW_HEIGHT;
  }, [view, leftRef, rightRef]);

  // --- Direct editing of a row ---

  const runEdit = (side: Side, at: number, remove: number, lines: string[]) =>
    tracked(-1, () => onEdit(side, at, remove, lines)); // the undo enters the same history as the merges

  // --- Copying one row to the other side ---

  const readOnly = { left: diff.leftReadOnly, right: diff.rightReadOnly };
  /** The block of rows the selected text takes, if it has two or more and goes to a side that can be modified. */
  const blockOf = (block: { side: Side; first: number; last: number } | null) =>
    block && block.last > block.first && !(block.side === "left" ? readOnly.right : readOnly.left) ? block : null;
  const copyBlock = (block: { side: Side; first: number; last: number }) => {
    if (busy || editingRef.current) return;
    void tracked(-1, () => onMergeRows(block.first, block.last, rowCopyDirection(block.side)));
  };

  /** How many rows the button of this pane copies (the selection is in this pane), or null for no button. */
  const rangeCount = (side: Side): number | null => {
    const block = blockOf(selRows);
    return block && block.side === side && !editing ? block.last - block.first + 1 : null;
  };

  const copyOneRow = (side: Side, row: number) => {
    if (busy || editingRef.current) return;
    void tracked(-1, () => onMergeRow(row, rowCopyDirection(side)));
  };

  /** Copies a row of the unified view: a removed one to the right, an added one to the left. */
  const copyUnifiedRow = (index: number) => {
    const row = unifiedAt(index);
    const direction = unifiedCopyDirection(row, readOnly);
    if (!row || !direction || busy || editingRef.current) return;
    void tracked(-1, () => onMergeRow(row.row, direction));
  };

  const { startEdit, endEdit, insertLine, deleteLine } = useLineEditing({
    setEditing,
    editingRef,
    busy,
    readOnly: { left: diff.leftReadOnly, right: diff.rightReadOnly },
    hunks,
    rowAt,
    runEdit,
    onLocate,
    revealRow: (row) => {
      const el = rightRef.current;
      if (el && (row < start || row >= end - 1)) el.scrollTop = scrollTopForRow(row, el.clientHeight, ROW_HEIGHT, total);
    },
  });
  endEditRef.current = endEdit;

  // --- Selecting a row ---

  const selectedRow = selected && selected.row < total ? selected.row : null;

  /** Selects the row; if it falls in a difference, that one becomes the current difference. */
  const selectRow = (side: Side, row: number, reveal = false) => {
    setSelected({ row, side });
    const h = hunks.findIndex((x) => row >= x.start && row < x.end);
    if (h >= 0) setCurrent(h);
    const el = rightRef.current;
    if (reveal && el) el.scrollTop = revealScrollTop(el.scrollTop, el.clientHeight, row, ROW_HEIGHT, SCROLLBAR_ALLOWANCE);
  };

  // --- Manual alignment ---

  // Copy: without the row numbers (selection of the panes, right-click menu, selected-row panel).
  const viewerRef = useRef<HTMLDivElement>(null);
  const [copied, showCopied] = useFlash();
  const copyText = (text: string) => void copyToClipboard(text).then((ok) => ok && showCopied());
  const selectedPane = useSelectionPane(viewerRef);
  const selRows = useSelectionRows(viewerRef);

  // --- Search in the text of one side (Ctrl+F) ---

  const search = useFileSearch({
    diffId: diff.id,
    revision: diff.revision,
    enabled: active && hasRows && !unified,
    blocked: () => editingRef.current !== null,
    // The pane the user was in: the last one clicked, or the side of the selected row.
    defaultSide: () => {
      const side = viewerRef.current?.dataset.select;
      return side === "left" || side === "right" ? side : (selected?.side ?? "left");
    },
    // The search starts from the top of what is seen.
    startRow: () => Math.floor((rightRef.current?.scrollTop ?? 0) / ROW_HEIGHT),
    onError: (error) => setLoadError({ error }),
  });
  const searchByRow = useMemo(() => {
    const byRow = new Map<number, Range[]>();
    for (const h of search.hits) {
      const list = byRow.get(h.row);
      if (list) list.push(h);
      else byRow.set(h.row, [h]);
    }
    return byRow;
  }, [search.hits]);
  // What the menus (Edit) can ask of this view while it is in the foreground: the state is read when they open.
  useRegisterCommands(active, () => ({
    undo: { enabled: diff.canUndo && !busy && !editing, run: () => void undo() },
    find: { enabled: hasRows && !unified && !editing, run: search.show },
    applyToRight: { enabled: current >= 0 && !busy && !editing && !diff.rightReadOnly, run: () => void merge("leftToRight") },
    applyToLeft: { enabled: current >= 0 && !busy && !editing && !diff.leftReadOnly, run: () => void merge("rightToLeft") },
  }));
  /** Closes the search and gives the keyboard back to the pane that was searched. */
  const closeSearch = () => {
    const side = search.side;
    search.close();
    viewerRef.current?.querySelector<HTMLElement>(`.pane.${side}`)?.focus();
  };
  const searchFor = (side: Side) => (search.open && search.side === side ? { byRow: searchByRow, current: search.currentHit } : null);
  // Showing the current match: the vertical scroll only if its row is not already seen, then the horizontal one
  // (once the row is drawn, which can take a few frames).
  const latestSearch = useRef({ search, total });
  latestSearch.current = { search, total };
  const revealCount = search.revealCount;
  useEffect(() => {
    const { search: s, total: rows } = latestSearch.current;
    const hit = s.currentHit;
    const el = rightRef.current;
    if (!hit || !el || revealCount === 0) return;
    const top = hit.row * ROW_HEIGHT;
    if (top < el.scrollTop || top + ROW_HEIGHT > el.scrollTop + el.clientHeight - SCROLLBAR_ALLOWANCE) {
      el.scrollTop = scrollTopForRow(hit.row, el.clientHeight, ROW_HEIGHT, rows);
    }
    let tries = 0;
    let frame = 0;
    const toColumn = () => {
      const mark = viewerRef.current?.querySelector(`.pane.${s.side} mark.find.current`);
      if (mark) mark.scrollIntoView({ block: "nearest", inline: "nearest" });
      else if (++tries < 15) frame = requestAnimationFrame(toColumn);
    };
    frame = requestAnimationFrame(toColumn);
    return () => cancelAnimationFrame(frame);
  }, [revealCount, rightRef, viewerRef]);
  const copySelection = () => {
    const text = selectionText();
    if (text !== null) copyText(text);
  };
  const selectionText = () => (viewerRef.current ? selectedCodeText(viewerRef.current, window.getSelection()) : null);

  /** Right click in the unified view: the menu only has "Copy" (the selected text, or the row if there is no selection). */
  const openUnifiedMenu = (index: number, x: number, y: number) => {
    const row = unifiedAt(index);
    if (!row) return;
    const text = selectionText();
    if (text === null) selectUnified(index); // with some text selected the selected row does not move
    const item = text !== null
      ? { label: t("fd.menu.copy"), shortcut: "Ctrl+C", onSelect: () => copyText(text) }
      : { label: t("fd.menu.copyLine"), onSelect: () => copyText(row.text) };
    const direction = unifiedCopyDirection(row, readOnly);
    const toSide = direction
      ? [{ label: t(direction === "leftToRight" ? "fd.menu.copyRowRight" : "fd.menu.copyRowLeft"), separator: true, onSelect: () => copyUnifiedRow(index) }]
      : [];
    setMenu({ x, y, items: [item, ...toSide] });
  };

  const sideName = (side: Side) => t(side === "left" ? "fd.side.left" : "fd.side.right");

  const { openMenu } = useManualAlign({
    t,
    active,
    busy,
    editingRef,
    rowAt,
    selectRow,
    pendingAlign,
    setPendingAlign,
    menu,
    setMenu,
    setAlignNote,
    alignCount: diff.aligns.length,
    onAlign,
    onUnalign,
    onClearAligns,
    onLocate,
    centerRow: (row) => {
      const el = rightRef.current;
      if (el) el.scrollTop = scrollTopForRow(row, el.clientHeight, ROW_HEIGHT, total);
    },
    rowItems: (side, row, r) => {
      const copy = canCopyRow(r, side, readOnly)
        ? [{ label: t(side === "left" ? "fd.menu.copyRowRight" : "fd.menu.copyRowLeft"), onSelect: () => copyOneRow(side, row) }]
        : [];
      // Editing the side: a row of the other side's block has no line here ("insert here"), the others can add or delete.
      let edit: ContextItem[] = [];
      if (!(side === "left" ? readOnly.left : readOnly.right)) {
        const cell = side === "left" ? r.left : r.right;
        edit = cell
          ? [
              { label: t("fd.menu.insertBelow"), onSelect: () => void insertLine(side, row, "below") },
              { label: t("fd.menu.insertAbove"), onSelect: () => void insertLine(side, row, "above") },
              { label: t("fd.menu.deleteLine"), onSelect: () => void deleteLine(side, row) },
            ]
          : [{ label: t("fd.menu.insertHere"), onSelect: () => startEdit(side, row) }];
      }
      return [...copy, ...edit.map((item, i) => (i === 0 && copy.length > 0 ? { ...item, separator: true } : item))];
    },
    extraItems: () => {
      const text = selectionText();
      if (text === null) return [];
      const items: { label: string; shortcut?: string; onSelect: () => void }[] = [
        { label: t("fd.menu.copy"), shortcut: "Ctrl+C", onSelect: () => copyText(text) },
      ];
      // The selected rows go to the other side.
      const rows = selectedRows(viewerRef.current ?? document, window.getSelection());
      const side = selRows?.side;
      const block = side && rows ? blockOf({ side, ...rows }) : null;
      if (block) {
        items.push({
          label: t(block.side === "left" ? "fd.menu.copyRowsRight" : "fd.menu.copyRowsLeft", { count: block.last - block.first + 1 }),
          onSelect: () => void copyBlock(block),
        });
      }
      return items;
    },
  });

  /** Selects a row of the unified view; if it falls in a block, that one becomes the current one. */
  const selectUnified = (row: number, reveal = false) => {
    setUSelected(row);
    const h = unifiedHunks.findIndex((x) => row >= x.start && row < x.end);
    if (h >= 0) setCurrent(h);
    const el = rightRef.current;
    if (reveal && el) el.scrollTop = revealScrollTop(el.scrollTop, el.clientHeight, row, ROW_HEIGHT, SCROLLBAR_ALLOWANCE);
  };

  const onUnifiedKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const next = nextSelection(e.key, uSelected ?? -1, pageRows(viewportHeight, ROW_HEIGHT), vTotal);
    if (next === undefined) return;
    e.preventDefault();
    if (vTotal > 0) selectUnified(Math.max(0, Math.min(vTotal - 1, next)), true);
  };

  const onPaneKeyDown = (side: Side) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editingRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "F2" || e.key === "Enter") {
      e.preventDefault();
      if (selected && selectedRow !== null) startEdit(selected.side, selectedRow);
      return;
    }
    const next = nextSelection(e.key, selectedRow ?? -1, pageRows(viewportHeight, ROW_HEIGHT), total);
    if (next === undefined) return;
    e.preventDefault();
    if (total > 0) selectRow(selected?.side ?? side, Math.max(0, Math.min(total - 1, next)), true);
  };
  // The selected row can leave the visible window (and the loaded rows): the panel
  // below the files remembers the last copy that arrived for the same row and the same comparison.
  const liveRow = selectedRow !== null ? rowAt(selectedRow) : undefined;
  const heldRow = useHeldRow(liveRow, `${diff.revision}:${selectedRow}`);
  const panelRow = selectedRow === null ? undefined : heldRow;

  const currentHunk = current >= 0 ? (vHunks[current] ?? null) : null;

  const counter =
    hunks.length === 0
      ? t("fd.counter.none")
      : current < 0
        ? t("fd.counter.total", { count: hunks.length })
        : t("fd.counter.at", { n: current + 1, total: hunks.length });

  const contentHeight = vTotal * ROW_HEIGHT;

  return (
    <section className="diff-view">
      {active &&
        sidebarSlot &&
        createPortal(
          <HunkPanel
            diffId={diff.id}
            revision={diff.revision}
            hunks={hunks}
            current={current}
            onGo={goTo}
          />,
          sidebarSlot,
        )}
      <FileToolbar
        barRef={barRef}
        compact={compactToolbar}
        diff={diff}
        busy={busy}
        current={current}
        counter={counter}
        onStep={step}
        onMerge={(direction) => void merge(direction)}
        onUndo={() => void undo()}
        onSave={() => void saveAll()}
        view={view}
        onSwitchView={switchView}
        showSpaces={showSpaces}
        onToggleSpaces={() => setShowSpaces((v) => !v)}
        ignoreCase={ignoreCase}
        onToggleIgnoreCase={onToggleIgnoreCase}
        ignoreWhitespace={ignoreWhitespace}
        onWhitespace={onWhitespace}
        algorithm={algorithm}
        onAlgorithm={onAlgorithm}
        rowFilter={rowFilter}
        onFilter={onFilter}
        onRefresh={onRefresh}
      />
      {hasRows && !unified && search.open && (
        <SearchBar
          query={search.query}
          onQuery={search.setQuery}
          caseSensitive={search.caseSensitive}
          onCaseSensitive={search.setCaseSensitive}
          side={search.side}
          onSide={search.setSide}
          total={search.hits.length}
          current={search.current}
          truncated={search.truncated}
          searching={search.searching}
          onNext={search.next}
          onPrev={search.prev}
          onClose={closeSearch}
          inputRef={search.inputRef}
        />
      )}
      <FileMeta diff={diff} busy={busy} onSave={onSave} />

      {pendingAlign && (
        <p className="notice align-hint" role="status">
          {t("fd.alignHint", { n: pendingAlign.number, side: sideName(pendingAlign.side), other: sideName(pendingAlign.side === "left" ? "right" : "left") })}
        </p>
      )}
      {alignNote && !pendingAlign && (
        <p className="notice align-note" role="status">
          {t("fd.alignNote")}
        </p>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} keepFocus />}
      {loadError && <p className="error">{t("fd.loadError", { error: describeError(loadError.error, t) })}</p>}
      {hasRows ? (
        <div
          ref={viewerRef}
          className={`viewer${unified ? " unified" : ""}`}
          // The selection stays in the pane where it starts: the other is not selected (the two sides would be copied together).
          onPointerDownCapture={(e) => {
            const pane = (e.target as HTMLElement).closest(".pane");
            e.currentTarget.dataset.select = pane?.classList.contains("right") ? "right" : pane?.classList.contains("left") ? "left" : "";
          }}
          onCopy={(e) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const text = selectionText();
            if (text === null) return;
            e.clipboardData.setData("text/plain", text);
            e.preventDefault();
            showCopied();
          }}
        >
          {unified ? (
            <UnifiedPane
              total={vTotal}
              rowAt={unifiedAt}
              start={start}
              end={end}
              width={width}
              current={currentHunk}
              scrollerRef={rightRef}
              onScroll={onRightScroll}
              selected={uSelected}
              onSelect={selectUnified}
              onKeyDown={onUnifiedKeyDown}
              onContext={openUnifiedMenu}
              showSpaces={showSpaces}
              showCopy={selectedPane === "unified"}
              onCopy={copySelection}
              copyDirection={(r) => (editing ? null : unifiedCopyDirection(r, readOnly))}
              onCopyRow={copyUnifiedRow}
            />
          ) : (
            <>
            <FilePane
              side="left"
              total={total}
              rowAt={rowAt}
              start={start}
              end={end}
              width={width}
              current={currentHunk}
              scrollerRef={leftRef}
              onScroll={onLeftScroll}
              editable={!diff.leftReadOnly}
              selected={selectedRow}
              onSelect={selectRow}
              onKeyDown={onPaneKeyDown("left")}
              onContext={openMenu}
              marked={pendingAlign}
              editing={editing}
              onStartEdit={startEdit}
              onEditText={(text) => setEditing((c) => (c ? { ...c, text } : c))}
              onEndEdit={(how) => void endEdit(how)}
              showSpaces={showSpaces}
              showCopy={selectedPane === "left"}
              onCopy={copySelection}
              canCopyRow={(r) => !editing && canCopyRow(r, "left", readOnly)}
              onCopyRow={(row) => copyOneRow("left", row)}
              rangeRows={rangeCount("left")}
              onCopyRange={() => selRows && blockOf(selRows) && copyBlock(selRows)}
              search={searchFor("left")}
            />
            <FilePane
              side="right"
              total={total}
              rowAt={rowAt}
              start={start}
              end={end}
              width={width}
              current={currentHunk}
              scrollerRef={rightRef}
              onScroll={onRightScroll}
              editable={!diff.rightReadOnly}
              selected={selectedRow}
              onSelect={selectRow}
              onKeyDown={onPaneKeyDown("right")}
              onContext={openMenu}
              marked={pendingAlign}
              editing={editing}
              onStartEdit={startEdit}
              onEditText={(text) => setEditing((c) => (c ? { ...c, text } : c))}
              onEndEdit={(how) => void endEdit(how)}
              showSpaces={showSpaces}
              showCopy={selectedPane === "right"}
              onCopy={copySelection}
              canCopyRow={(r) => !editing && canCopyRow(r, "right", readOnly)}
              onCopyRow={(row) => copyOneRow("right", row)}
              rangeRows={rangeCount("right")}
              onCopyRange={() => selRows && blockOf(selRows) && copyBlock(selRows)}
              search={searchFor("right")}
            />
            </>
          )}
          <div
            className="overview"
            {...overview}
            aria-hidden="true"
          >
            {marks.map((m) => (
              <div
                key={m.index}
                data-hunk={m.index}
                className={`mark ${m.kind}${m.index === current ? " current" : ""}`}
                style={{
                  top: `${(m.start / vTotal) * 100}%`,
                  height: `${((m.end - m.start) / vTotal) * 100}%`,
                }}
              />
            ))}
            <div
              className="viewport"
              style={{
                top: `${(scrollTop / contentHeight) * 100}%`,
                height: `${Math.min(100, (viewportHeight / contentHeight) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <p className="notice">{t("fd.bothEmpty")}</p>
      )}
      {hasRows && !unified && <LinePanel row={panelRow} onCopy={copyText} />}
      {copied && (
        <div className="copy-toast" role="status">
          {t("fd.copied")}
        </div>
      )}
    </section>
  );
}
