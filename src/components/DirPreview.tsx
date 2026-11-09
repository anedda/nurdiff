import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/context";
import { describeError } from "../i18n";
import { describeExtFilter, isExtFilterActive } from "../lib/extFilter";
import { formatDate, formatSize } from "../lib/format";
import { describeMinor } from "../lib/minor";
import { previewMapEntries } from "../lib/previewMap";
import { previewStats, scanStats } from "../lib/previewSummary";
import { usePreviewScan } from "../lib/usePreviewScan";
import { filterRows, isPreviewFilter, swapFilter } from "../lib/previewFilter";
import { pairKind, type PreviewMark, type PreviewSelection } from "../lib/previewPick";
import { key, previewReading, type DirSize, type PreviewList, type PreviewRow } from "../lib/previewTree";
import { revealItems } from "../lib/revealMenu";
import { joinPath, type DirFilter } from "../lib/tree";
import { EXPAND_LIMIT, usePreviewListings } from "../lib/usePreviewListings";
import { usePreviewSizes } from "../lib/usePreviewSizes";
import { useRootsChange } from "../lib/useRootsChange";
import { useSettings } from "../settingsContext";
import { useCompactToolbar } from "../lib/useAutoCompact";
import type { DirStats, ExtFilter, Side } from "../types";
import ContextMenu, { type ContextItem } from "./ContextMenu";
import DirFilterBar from "./DirFilterBar";
import DirTools from "./DirTools";
import EntryIcon from "./EntryIcon";
import ExtFilterButton from "./ExtFilterButton";
import TbSep from "./TbSep";
import DirSummary from "./DirSummary";
import DirMap from "./DirMap";
import ViewSwitch from "./ViewSwitch";
import type { ViewMode } from "./ViewSwitch";
import VirtualList from "./VirtualList";

const ROW_HEIGHT = 22;

function Half({ row, side, total, onToggle }: { row: PreviewRow; side: Side; total?: DirSize; onToggle: () => void }) {
  const t = useT();
  const entry = side === "left" ? row.pair.left : row.pair.right;
  if (!entry) return <div className="half empty" />;
  return (
    <div className="half">
      <span className="dir-name" style={{ paddingLeft: row.depth * 18 }} title={row.rel}>
        {row.isDir ? (
          <button
            type="button"
            className="twisty"
            tabIndex={-1}
            aria-label={t(row.expanded ? "common.collapse" : "common.expand")}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {row.expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="twisty" />
        )}
        <EntryIcon kind={entry.kind} open={entry.kind === "dir" && row.expanded} />
        {row.pair.name}
        {row.loading ? " …" : ""}
        {row.failed ? ` ${t("preview.unreadable")}` : ""}
      </span>
      {entry.kind === "dir" ? (
        <span className="dir-size total" title={t("dir.totalTitle")}>
          {total === undefined || total === "loading" ? "…" : total === "error" ? "" : formatSize(total)}
        </span>
      ) : (
        <span className="dir-size">{entry.kind === "file" ? formatSize(entry.size) : ""}</span>
      )}
      <span className="dir-date">{entry.modified == null ? "" : formatDate(entry.modified)}</span>
    </div>
  );
}

/**
 * The content of the two chosen folders, before the comparison: a single list with the two folders
 * side by side by name (where an entry is missing the other side is dashed), without colours or statuses.
 * Folders open on both sides together and are read when needed.
 *
 * "Compare" compares the whole folders. Alternatively a row is chosen (one at a time, only with
 * the two entries of the same name and the same type): "Compare selection" compares it in place and
 * updates the mark in the central column; double click on a file, or the context menu, opens it in
 * a new tab.
 */
export default function DirPreview({
  view,
  onView,
  left,
  right,
  selected,
  onSelect,
  marks,
  summaries,
  busy = false,
  onCompareRow,
  onOpenRow,
  onReveal,
  onRefreshed,
  extFilter,
  onExtFilter,
  onList,
  toggleRequest,
}: {
  /** How the folders are shown: the list (side by side) or the map. */
  view: ViewMode;
  onView: (view: ViewMode) => void;
  left: string;
  right: string;
  selected: PreviewSelection | null;
  onSelect: (sel: PreviewSelection | null) => void;
  marks: ReadonlyMap<string, PreviewMark>;
  /** Summary of the comparison of the folders already compared in place. */
  summaries: ReadonlyMap<string, DirStats>;
  busy?: boolean;
  onCompareRow: (rel: string) => void;
  onOpenRow: (rel: string, kind: "file" | "dir") => void;
  /** "Show in file manager" from the menu: opens the file manager on a path. */
  onReveal: (path: string) => void;
  /** The content was read again: the marks of the comparisons already made in place are no longer valid. */
  onRefreshed: () => void;
  /** File filter by extension: changing it rereads the list and the marks are no longer valid. */
  extFilter: ExtFilter;
  onExtFilter: (filter: ExtFilter) => void;
  /** The rows read, for the sidebar; null when the preview disappears. */
  onList: (list: PreviewList | null) => void;
  /** The sidebar asks to open or close a folder in its own tree (`id` changes at every request). */
  toggleRequest?: { id: number; rel: string } | null;
}) {
  const t = useT();
  const { dirStripes } = useSettings();
  const { barRef, compact } = useCompactToolbar();
  const roots: Record<Side, string> = { left, right };
  // What is read and what is open; the folder sizes; the filter.
  const listings = usePreviewListings(left, right, extFilter);
  const { rows, sideRows, cache, toggleSide } = listings;
  const { toggle } = listings;
  const readState = previewReading(cache, { left, right });
  useEffect(() => {
    onList({ rows: sideRows, left, right, state: readState });
  }, [sideRows, left, right, readState, onList]);
  useEffect(() => () => onList(null), [onList]);
  const handled = useRef(0);
  const latestToggleSide = useRef(toggleSide);
  latestToggleSide.current = toggleSide;
  useEffect(() => {
    if (!toggleRequest || toggleRequest.id === handled.current) return;
    handled.current = toggleRequest.id;
    latestToggleSide.current(toggleRequest.rel);
  }, [toggleRequest]);
  // Filter: only those that do not need the contents; it applies to the folders already read.
  const [filter, setFilter] = useState<DirFilter>("all");
  useRootsChange(left, right, () => setFilter(swapFilter), () => {});
  // The rows that are seen: with a filter, those that match and the folders that contain them.
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const { sizes, restart: restartSizes, dropQueued } = usePreviewSizes(left, right, shown, listings.autoExpand > 0);
  // The map of the preview: the same rows, sizes (they keep arriving: the cells grow) and comparison marks.
  const mapEntries = useMemo(() => previewMapEntries(shown, sizes, marks), [shown, sizes, marks]);
  const reading = useMemo(() => new Set(rows.filter((r) => r.loading).map((r) => r.rel)), [rows]);
  const rowOf = (rel: string) => rows.find((r) => r.rel === rel);

  const collapseAll = () => {
    listings.collapseAll();
    dropQueued();
  };
  const refresh = () => {
    // The chosen folders and the open ones are read again (the openings and the chosen row stay).
    listings.reload();
    restartSizes();
    rescan();
    onRefreshed();
  };
  // The file filter changed: everything is read again (not the first time).
  const seenFilter = useRef(extFilter);
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;
  useEffect(() => {
    if (seenFilter.current === extFilter) return;
    seenFilter.current = extFilter;
    latestRefresh.current();
  }, [extFilter]);
  const expandNote = listings.limitReached ? t("preview.expandLimit", { n: EXPAND_LIMIT }) : null;

  // Messages about the starting folders: not chosen, being read, unreadable.
  const messages: string[] = [];
  const names: Record<Side, string> = { left: t("side.left"), right: t("side.right") };
  let waiting = false;
  for (const s of ["left", "right"] as const) {
    const v = cache[key(s, "")];
    if (!roots[s].trim()) messages.push(t("preview.noFolder", { side: names[s] }));
    else if (v === undefined || v === "loading") waiting = true;
    else if (!Array.isArray(v)) messages.push(`${names[s]}: ${describeError(v.error, t)}`);
  }
  if (isExtFilterActive(extFilter)) messages.push(t("extFilter.active", { desc: describeExtFilter(extFilter, t) }));
  if (waiting) messages.push(t("preview.reading"));
  else if (rows.length === 0 && messages.length === 0) messages.push(t("preview.empty"));
  if (filter !== "all" && !waiting) {
    if (shown.length === 0 && rows.length > 0) messages.push(t("preview.noMatch"));
    messages.push(t("preview.filterNote"));
  }

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
  const kindOf = (row: PreviewRow) => pairKind(row.pair.left?.kind ?? null, row.pair.right?.kind ?? null);

  /** Click on a row: it chooses it, or clears the choice if it already was the one. */
  const clickRow = (row: PreviewRow, e: { detail: number }) => {
    // In a double click only the first click counts: the second must not clear the choice.
    if (e.detail > 1) return;
    onSelect(selected?.rel === row.rel ? null : { rel: row.rel, kind: kindOf(row) });
  };

  /** Double click: a folder opens/closes (from the centre it is compared), a file present on both sides opens in a tab. */
  const dblRow = (row: PreviewRow, center: boolean) => {
    const kind = kindOf(row);
    onSelect({ rel: row.rel, kind });
    if (kind === "file" || (kind === "dir" && center)) onOpenRow(row.rel, kind);
    else toggle(row);
  };

  const rowMenu = (row: PreviewRow, e: React.MouseEvent) => {
    e.preventDefault();
    const kind = kindOf(row);
    onSelect({ rel: row.rel, kind });
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t("dir.menu.compare"), disabled: !kind || busy || marks.get(row.rel) === "busy", onSelect: () => onCompareRow(row.rel) },
        { label: t("dir.menu.openTab"), disabled: !kind, onSelect: () => kind && onOpenRow(row.rel, kind) },
        ...revealItems(
          {
            left: row.pair.left ? joinPath(left, row.rel) : null,
            right: row.pair.right ? joinPath(right, row.rel) : null,
          },
          onReveal,
          t,
        ),
      ],
    });
  };

  // The counts: with the scan they are those of all the entries (also of closed folders); until it is ready,
  // those of the rows already read.
  const { scan, scanning, rescan } = usePreviewScan(left, right, extFilter);
  const previewTotals = useMemo(() => (scan ? scanStats(scan, marks, summaries) : previewStats(rows, marks, summaries)), [scan, rows, marks, summaries]);

  let hint = t("preview.hint");
  if (selected) {
    hint = selected.kind ? t("preview.hint.picked", { path: selected.rel }) : t("preview.hint.notComparable", { path: selected.rel });
    const stats = summaries.get(selected.rel);
    if (stats && marks.get(selected.rel) !== "busy") hint = `${t("preview.summary", { ...stats })} — ${hint}`;
  }

  // The summary: below the bar, or inside the compact bar; it is not there until the folders are read.
  const summary =
    rows.length > 0 && !waiting ? (
      <div className="summary">
        <DirSummary stats={previewTotals} notCompared={previewTotals.notCompared} scanning={scanning} truncatedAt={scan?.truncated ? scan.visited : null} />
      </div>
    ) : null;

  return (
    <section
      className="diff-view dir-preview"
      onClick={(e) => {
        // A click on the background (not on a row, a control, a menu or the map) clears the choice, as in the comparison.
        if (!(e.target as HTMLElement).closest(".dir-row, button, input, select, textarea, a, label, .ctx-menu, .dir-map-view")) onSelect(null);
      }}
    >
      <div ref={barRef} className={`dirbar tb-card${compact ? " tb-compact" : ""}`} role="toolbar" aria-label={t("toolbar.label")}>
        <DirFilterBar
          filter={filter}
          onFilter={setFilter}
          unavailable={(f) => !isPreviewFilter(f)}
          unavailableTitle={t("preview.needsCompare")}
        />
        <TbSep />
        <ExtFilterButton filter={extFilter} onApply={onExtFilter} hint={t("extFilter.hint.preview")} />
        <TbSep />
        <ViewSwitch
          modes={["split", "unified", "map"]}
          enabled={["split", "map"]}
          value={view}
          onChange={onView}
          unavailableTitle={{ unified: t("fd.view.unified.dirs") }}
        />
        <TbSep />
        <DirTools
          onExpand={listings.expandAll}
          onCollapse={collapseAll}
          onRefresh={refresh}
          busy={busy}
          titles={{ expand: t("preview.expandAll", { n: EXPAND_LIMIT }), collapse: t("preview.collapseAll"), refresh: t("preview.refresh") }}
          offReason={view === "map" ? t("dir.expandMapOff") : undefined}
        />
        {compact && summary}
      </div>
      {!compact && summary && <div className="toolbar summary-row">{summary}</div>}
      {expandNote && (
        <p className="preview-msg" role="status">
          {expandNote}
        </p>
      )}
      <p className="notice">{hint}</p>
      {messages.length > 0 && (
        <p className="preview-msg" role="status">
          {messages.join("  ·  ")}
        </p>
      )}
      {view === "map" ? (
        <DirMap
          entries={mapEntries}
          filter="all"
          pattern=""
          selected={selected?.rel ?? null}
          onSelect={(rel) => {
            const row = rel === null ? undefined : rowOf(rel);
            onSelect(row ? { rel: row.rel, kind: kindOf(row) } : null);
          }}
          onOpen={(entry) => {
            const row = rowOf(entry.path);
            const kind = row ? kindOf(row) : null;
            if (kind) onOpenRow(entry.path, kind);
          }}
          onContextMenu={(e, entry) => {
            const row = rowOf(entry.path);
            if (row) rowMenu(row, e);
          }}
          counts={{ counts: {}, request: () => {}, cancel: () => {} }}
          preview={{ reading, onEnter: listings.openPath }}
        />
      ) : (
      <div
        className="dir-list"
        onClick={(e) => {
          // A click outside the rows (in the empty space below the list) clears the choice.
          if (!(e.target as HTMLElement).closest(".dir-row")) onSelect(null);
        }}
      >
        <div className="dir-row head marked">
          <div className="half">
            <span>{t("side.left")}</span>
            <span className="dir-size">{t("col.size")}</span>
            <span className="dir-date">{t("col.date")}</span>
          </div>
          <div className="dir-mark" aria-hidden="true" />
          <div className="half">
            <span>{t("side.right")}</span>
            <span className="dir-size">{t("col.size")}</span>
            <span className="dir-date">{t("col.date")}</span>
          </div>
        </div>
        <VirtualList
          className="dir-body"
          count={shown.length}
          rowHeight={ROW_HEIGHT}
          renderRow={(i) => {
            const row = shown[i];
            const mark = marks.get(row.rel);
            const kind = kindOf(row);
            const minor = mark && mark !== "busy" && !("error" in mark) && mark.status === "different" ? mark.minor : undefined;
            const text = mark === "busy" ? "…" : mark ? ("error" in mark ? "!" : mark.status === "identical" ? "=" : minor ? "≈" : "≠") : "";
            const markClass = mark && mark !== "busy" ? ("error" in mark ? "failed" : minor ? "minor" : mark.status) : "";
            return (
              <div
                className={`dir-row marked${dirStripes && i % 2 === 1 ? " stripe" : ""}${selected?.rel === row.rel ? " selected" : ""}`}
                onClick={(e) => clickRow(row, e)}
                onDoubleClick={(e) => dblRow(row, (e.target as HTMLElement).closest(".dir-mark") !== null)}
                onContextMenu={(e) => rowMenu(row, e)}
              >
                <Half row={row} side="left" total={sizes[key("left", row.rel)]} onToggle={() => toggle(row)} />
                <div
                  className={`dir-mark${markClass ? " " + markClass : ""}`}
                  title={
                    mark && mark !== "busy" && "error" in mark
                      ? mark.error
                      : minor
                        ? t("status.minor", { causes: describeMinor(minor, t) })
                        : t(kind ? "preview.center.pair" : "preview.center.single")
                  }
                >
                  {text && <span className="mark-badge">{text}</span>}
                </div>
                <Half row={row} side="right" total={sizes[key("right", row.rel)]} onToggle={() => toggle(row)} />
              </div>
            );
          }}
        />
      </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </section>
  );
}
