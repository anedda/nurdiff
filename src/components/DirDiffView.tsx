import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/context";
import { STATUS_KEY, statusText } from "../lib/dirReport";
import { describeExtFilter, isExtFilterActive } from "../lib/extFilter";
import { formatDate, formatSize } from "../lib/format";
import { revealItems } from "../lib/revealMenu";
import { canCompareRow, defaultExpanded, dirTotals, diffMark, isDirEntry, isMinor, joinPath, newerSide, statusClass, statusKind, visibleRows } from "../lib/tree";
import type { DirFilter, DirTotals, TreeRow } from "../lib/tree";
import type { DirDiff, DirEntryDiff, ExtFilter, Side } from "../types";
import { useSettings } from "../settingsContext";
import { useCompactToolbar } from "../lib/useAutoCompact";
import DirFilterBar from "./DirFilterBar";
import DirTools from "./DirTools";
import ContextMenu, { type ContextItem } from "./ContextMenu";
import EntryIcon from "./EntryIcon";
import TbSep from "./TbSep";
import ViewSwitch from "./ViewSwitch";
import type { ViewMode } from "./ViewSwitch";
import DirMap from "./DirMap";
import DirSummary from "./DirSummary";
import { SearchIcon, StatusIcon } from "./icons";
import { countOf, countSign, diffLineCount, needsCount } from "../lib/diffCounts";
import type { DiffCount } from "../lib/diffCounts";
import { useDiffCounts } from "../lib/useDiffCounts";
import ExtFilterButton from "./ExtFilterButton";
import VirtualList from "./VirtualList";

const ROW_HEIGHT = 22;

interface Props {
  diff: DirDiff;
  /** How the list is shown (side by side, unified, map): it stays between the preview and the comparison. */
  view: ViewMode;
  onView: (view: ViewMode) => void;
  /** Double click (or Enter) on a file, or "Open in a new tab" from the menu: comparison in a new tab. */
  onOpenRow: (entry: DirEntryDiff) => void;
  /** The two compared folders, and "Show in file manager" from the menu: opens the file manager on a path. */
  roots: { left: string; right: string };
  onReveal: (path: string) => void;
  /** The chosen row (relative path) and its change. */
  selected: string | null;
  onSelect: (path: string | null) => void;
  /** Compares the row in place and updates its mark. */
  onCompareRow: (path: string) => void;
  /** Provisional marks: row being compared ("busy") or failed comparison (the reason). */
  marks: ReadonlyMap<string, "busy" | { error: string }>;
  /** Rows compared again that stay visible even if the filter would exclude them. */
  keep?: ReadonlySet<string>;
  /** The filter changed: the kept rows are no longer needed. */
  onFilterChange?: () => void;
  /** Filter the list opens with (from the options). */
  initialFilter?: DirFilter;
  /** Swaps the two sides and compares again; absent = button disabled. */
  onRefresh?: () => void;
  /** File filter the comparison was made with, and its change (compares again). */
  extFilter: ExtFilter;
  onExtFilter: (filter: ExtFilter) => void;
  busy?: boolean;
}

function Half({ row, side, total, onToggle }: { row: TreeRow; side: Side; total?: DirTotals; onToggle: () => void }) {
  const t = useT();
  const { entry } = row;
  const kind = side === "left" ? entry.leftKind : entry.rightKind;
  if (kind === null) return <div className="half empty" />;
  const size = side === "left" ? entry.leftSize : entry.rightSize;
  const modified = side === "left" ? entry.leftModified : entry.rightModified;
  const newer = newerSide(entry) === side;
  return (
    <div className="half">
      <span className="dir-name" style={{ paddingLeft: row.depth * 18 }} title={entry.path}>
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
        <EntryIcon kind={kind} open={row.expanded} />
        {row.name}
      </span>
      {row.isDir && total && total[side] !== null ? (
        <span className="dir-size total" title={t("dir.totalTitle")}>{formatSize(total[side] as number)}</span>
      ) : (
        <span className="dir-size">{formatSize(size)}</span>
      )}
      <span className={newer ? "dir-date newer" : "dir-date"}>{formatDate(modified)}</span>
    </div>
  );
}

/**
 * A row of the unified view: the name once only (with the tree), the status in words and, for each
 * side, size and date; for the sides where the entry is missing the cells stay empty.
 */
function DiffCountCell({ entry, count, request, cancel }: { entry: DirEntryDiff; count: DiffCount | undefined; request: (e: DirEntryDiff) => void; cancel: (e: DirEntryDiff) => void }) {
  const t = useT();
  const wants = needsCount(entry);
  useEffect(() => {
    if (!wants) return;
    request(entry);
    return () => cancel(entry);
  }, [wants, entry, request, cancel]);
  if (!wants) return <span className="dir-size" />;
  const sign = countSign(count, t);
  if (sign) return <span className="dir-size" title={sign.title} aria-busy={sign.busy}>{sign.text}</span>;
  if (typeof count !== "object") return null;
  const n = diffLineCount(count);
  // The file differs by bytes but no row does: only the line ending, the encoding or the like change.
  if (n === 0) return <span className="dir-size" title={t("dir.diffCount.formatOnlyTitle")}>{t("dir.diffCount.formatOnly")}</span>;
  return (
    <span className="dir-size" title={t("dir.diffCount.title", { changed: count.changed, left: count.leftOnly, right: count.rightOnly })}>
      {n.toLocaleString()} <span className="dir-count-unit">{t("dir.diffCount.unit", { count: n })}</span>
    </span>
  );
}

function UnifiedCells({ row, total, counts, onToggle }: { row: TreeRow; total?: DirTotals; counts: ReturnType<typeof useDiffCounts>; onToggle: () => void }) {
  const t = useT();
  const { entry } = row;
  const kind = entry.leftKind ?? entry.rightKind;
  const newer = newerSide(entry);
  const label = isMinor(entry) ? t("dir.unified.minor") : t(STATUS_KEY[entry.status]);
  const icon = statusKind(entry);
  const side = (s: Side) => {
    const k = s === "left" ? entry.leftKind : entry.rightKind;
    if (k === null) return <><span className="dir-size" /><span className="dir-date" /></>;
    const size = s === "left" ? entry.leftSize : entry.rightSize;
    const modified = s === "left" ? entry.leftModified : entry.rightModified;
    const sum = row.isDir && total ? total[s] : null;
    return (
      <>
        {sum !== null ? <span className="dir-size total" title={t("dir.totalTitle")}>{formatSize(sum)}</span> : <span className="dir-size">{formatSize(size)}</span>}
        <span className={newer === s ? "dir-date newer" : "dir-date"}>{formatDate(modified)}</span>
      </>
    );
  };
  return (
    <>
      <div className="u-status" role="img" aria-label={label} title={label}>
        <StatusIcon status={icon} />
      </div>
      <div className="half u-name">
        <span className="dir-name" style={{ paddingLeft: row.depth * 18 }} title={entry.path}>
          {row.isDir ? (
            <button type="button" className="twisty" tabIndex={-1} aria-label={t(row.expanded ? "common.collapse" : "common.expand")} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
              {row.expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="twisty" />
          )}
          {kind && <EntryIcon kind={kind} open={row.expanded} />}
          {row.name}
        </span>
      </div>
      <div className="u-side">{side("left")}</div>
      <div className="u-side">{side("right")}</div>
      <div className="u-count">
        <DiffCountCell entry={entry} count={countOf(entry, counts.counts)} request={counts.request} cancel={counts.cancel} />
      </div>
    </>
  );
}

export default function DirDiffView({ diff, view, onView, onOpenRow, roots, onReveal, selected, onSelect, onCompareRow, marks, keep, onFilterChange, initialFilter = "all", onRefresh, extFilter, onExtFilter, busy = false }: Props) {
  const t = useT();
  const { dirStripes } = useSettings();
  const { barRef, compact } = useCompactToolbar();
  const [filter, setFilter] = useState<DirFilter>(initialFilter);
  const [pattern, setPattern] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(diff.entries));
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
  const [reveal, setReveal] = useState<{ index: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const unified = view === "unified";
  const diffCounts = useDiffCounts(roots.left, roots.right);
  const body = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => visibleRows(diff.entries, expanded, filter, pattern, keep),
    [diff.entries, expanded, filter, pattern, keep],
  );
  const totals = useMemo(() => dirTotals(diff.entries), [diff.entries]);
  const selectedIndex = selected === null ? -1 : rows.findIndex((r) => r.entry.path === selected);

  const toggle = useCallback((path: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const want = open ?? !prev.has(path);
      if (want) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  /** Opens a file in a new tab; if it cannot (one side only, different types) it says so. */
  function openFile(entry: DirEntryDiff, name: string) {
    setHint(null);
    if (entry.leftKind === "file" && entry.rightKind === "file") {
      onOpenRow(entry);
    } else if (entry.leftKind === null || entry.rightKind === null) {
      setHint(t("sb.hint.oneSide", { name }));
    } else {
      setHint(t("sb.hint.notText", { name }));
    }
  }

  function open(row: TreeRow) {
    if (row.isDir) {
      setHint(null);
      toggle(row.entry.path);
    } else {
      openFile(row.entry, row.name);
    }
  }

  /** The context menu items of an entry (rows and cells of the map). */
  function menuItems(entry: DirEntryDiff, inMap = false): ContextItem[] {
    const state = marks.get(entry.path);
    const can = canCompareRow(entry);
    return [
      // In the map the in-place re-comparison has no mark to update: it is not offered.
      ...(inMap ? [] : [{ label: t("dir.menu.compare"), disabled: !can || busy || state === "busy", onSelect: () => onCompareRow(entry.path) }]),
      { label: t("dir.menu.openTab"), disabled: !can, onSelect: () => onOpenRow(entry) },
      ...revealItems(
        {
          left: entry.leftKind !== null ? joinPath(roots.left, entry.path) : null,
          right: entry.rightKind !== null ? joinPath(roots.right, entry.path) : null,
        },
        onReveal,
        t,
      ),
    ];
  }

  function select(index: number) {
    const i = Math.max(0, Math.min(rows.length - 1, index));
    if (rows[i]) {
      onSelect(rows[i].entry.path);
      setReveal({ index: i });
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (view === "map") return;
    const row = selectedIndex >= 0 ? rows[selectedIndex] : undefined;
    switch (e.key) {
      case "ArrowDown":
        select(selectedIndex + 1);
        break;
      case "ArrowUp":
        select(selectedIndex < 0 ? 0 : selectedIndex - 1);
        break;
      case "ArrowRight":
        if (row?.isDir && !row.expanded) toggle(row.entry.path, true);
        else select(selectedIndex + 1);
        break;
      case "ArrowLeft":
        if (row?.isDir && row.expanded) toggle(row.entry.path, false);
        break;
      case "Enter":
        if (row) open(row);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const { stats } = diff;
  const dirPaths = useMemo(
    () => diff.entries.filter(isDirEntry).map((e) => e.path),
    [diff.entries],
  );

  // Summary and filter by name: below the bar, or inside the compact bar.
  const summary = (
    <>
      <div className="summary">
        <DirSummary stats={stats} />
      </div>
      <div className="name-filter-wrap">
        <SearchIcon />
        <input
          className="name-filter"
          value={pattern}
          onChange={(e) => setPattern(e.currentTarget.value)}
          placeholder={t("dir.nameFilter")}
          aria-label={t("dir.nameFilter")}
        />
      </div>
    </>
  );

  return (
    <section
      className="diff-view"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // A click on the background (not on a row, a control, a menu or the map) clears the choice.
        if (!(e.target as HTMLElement).closest(".dir-row, button, input, select, textarea, a, label, .ctx-menu, .dir-map-view")) {
          onSelect(null);
          setHint(null);
        }
      }}
    >
      <div ref={barRef} className={`dirbar tb-card${compact ? " tb-compact" : ""}`} role="toolbar" aria-label={t("toolbar.label")}>
        <DirFilterBar filter={filter} onFilter={(f) => { setFilter(f); onFilterChange?.(); }} />
        <TbSep />
        <ExtFilterButton filter={extFilter} onApply={onExtFilter} disabled={busy} hint={t("extFilter.hint.compare")} />
        <TbSep />
        <ViewSwitch modes={["split", "unified", "map"]} enabled={["split", "unified", "map"]} value={view} onChange={onView} />
        <TbSep />
        <DirTools
          onExpand={() => setExpanded(new Set(dirPaths))}
          onCollapse={() => setExpanded(new Set())}
          onRefresh={onRefresh}
          busy={busy}
          titles={{ expand: t("dir.expandAll"), collapse: t("dir.collapseAll"), refresh: t("dir.refresh") }}
          offReason={view === "map" ? t("dir.expandMapOff") : undefined}
        />
        {compact && summary}
      </div>
      {!compact && <div className="toolbar summary-row">{summary}</div>}
      {isExtFilterActive(extFilter) && (
        <p className="notice" role="status">
          {t("extFilter.active", { desc: describeExtFilter(extFilter, t) })}
        </p>
      )}
      {hint && <p className="notice">{hint}</p>}
      {view === "map" ? (
        <DirMap
          entries={diff.entries}
          filter={filter}
          pattern={pattern}
          keep={keep}
          selected={selected}
          onSelect={(path) => {
            onSelect(path);
            setHint(null);
          }}
          onOpen={(entry) => openFile(entry, entry.path.slice(entry.path.lastIndexOf("/") + 1))}
          onContextMenu={(e, entry) => setMenu({ x: e.clientX, y: e.clientY, items: menuItems(entry, true) })}
          counts={diffCounts}
        />
      ) : rows.length === 0 ? (
        <p className="notice">
          {filter === "diffs" && !pattern.trim()
            ? t("dir.noDiffs")
            : t("dir.noMatch")}
        </p>
      ) : (
        <div className={`dir-list${unified ? " unified" : ""}`} tabIndex={0} ref={body}>
          {unified ? (
            <div className="dir-row head marked unified">
              <div className="u-status" aria-label={t("col.status")} title={t("dir.unified.legend")} />
              <div className="half"><span>{t("col.name")}</span></div>
              <div className="u-side head-side">{t("col.leftSide")}<span className="u-head-hint"> {t("col.sideHint")}</span></div>
              <div className="u-side head-side">{t("col.rightSide")}<span className="u-head-hint"> {t("col.sideHint")}</span></div>
              <div className="u-count head-count">{t("col.diffs")}</div>
            </div>
          ) : (
            <div className="dir-row head marked">
              {(["left", "right"] as const).map((side) => (
                <Fragment key={side}>
                  {side === "right" && <div className="dir-mark" aria-hidden="true" />}
                  <div className="half">
                    <span>{t("col.name")}</span>
                    <span className="dir-size">{t("col.size")}</span>
                    <span className="dir-date">{t("col.date")}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          )}
          <VirtualList
            className="dir-body"
            count={rows.length}
            rowHeight={ROW_HEIGHT}
            reveal={reveal}
            renderRow={(i) => {
              const row = rows[i];
              const path = row.entry.path;
              const unreadable = row.entry.error ? { error: t("dir.unreadable", { reason: row.entry.error }) } : undefined;
              const state = marks.get(path) ?? unreadable;
              const mark = state === "busy" ? "…" : state ? "!" : diffMark(row.entry);
              const markTitle = state && state !== "busy" ? state.error : undefined;
              return (
                <div
                  className={`dir-row marked${unified ? " unified" : ""} ${statusClass(row.entry)}${dirStripes && i % 2 === 1 ? " stripe" : ""}${path === selected ? " selected" : ""}${state ? (state === "busy" ? " pending" : " failed") : ""}`}
                  title={markTitle ?? statusText(row.entry, t)}
                  onClick={(e) => {
                    // In a double click only the first click counts; a second click on the chosen row clears the choice.
                    if (e.detail > 1) return;
                    onSelect(path === selected ? null : path);
                    setHint(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelect(path);
                    setHint(null);
                    setMenu({ x: e.clientX, y: e.clientY, items: menuItems(row.entry) });
                  }}
                  onDoubleClick={() => {
                    onSelect(path); // the first click of a double click may have cleared the choice
                    open(row);
                  }}
                >
                  {unified ? (
                    <UnifiedCells row={row} total={totals.get(path)} counts={diffCounts} onToggle={() => toggle(path)} />
                  ) : (
                    <>
                      <Half row={row} side="left" total={totals.get(path)} onToggle={() => toggle(path)} />
                      <div className="dir-mark" aria-hidden={markTitle ? undefined : "true"} title={markTitle}>{mark && <span className="mark-badge">{mark}</span>}</div>
                      <Half row={row} side="right" total={totals.get(path)} onToggle={() => toggle(path)} />
                    </>
                  )}
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
