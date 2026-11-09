import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n/context";
import { allFolders, comparable, relativeTo } from "../lib/sidebarFiles";
import { statusText } from "../lib/dirReport";
import { defaultExpanded, joinPath, statusKind, visibleRows } from "../lib/tree";
import { useRevealRequest } from "../lib/useKeyed";
import type { DirDiff } from "../types";
import type { PreviewList } from "../lib/previewTree";
import EntryIcon from "./EntryIcon";
import PreviewFilesList from "./PreviewFilesList";
import { CollapseAllIcon, ExpandAllIcon, StatusIcon } from "./icons";
import VirtualList from "./VirtualList";

const ROW_HEIGHT = 24;

export interface FilesContext {
  diff: DirDiff;
  left: string;
  right: string;
}

interface Props {
  /** The folder comparison the files are chosen from; null if the foreground tab has none. */
  context: FilesContext | null;
  /** Before the comparison: the content read by the folder preview (used if `context` is null). */
  preview?: PreviewList | null;
  onTogglePreview?: (rel: string) => void;
  /** Path of the file open in the foreground tab (left side), if it is a file comparison. */
  currentLeft: string | null;
  /** Opens the comparison of the two files (in the current tab, if it is a file comparison). */
  onOpen: (left: string, right: string) => void;
  /** Why there is no list, when `context` is null. */
  emptyReason: string;
}

/** Sidebar: the files of the folder comparison, to move from one to another. */
export default function FilesPanel({ context, preview, onTogglePreview, currentLeft, onOpen, emptyReason }: Props) {
  const t = useT();
  const [onlyDiffs, setOnlyDiffs] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState<string | null>(null);

  // New folder comparison: we start again from the folders with differences open.
  const entries = context?.diff.entries;
  useEffect(() => {
    setExpanded(entries ? defaultExpanded(entries) : new Set());
    setHint(null);
  }, [entries]);

  const rows = useMemo(
    () => (entries ? visibleRows(entries, expanded, onlyDiffs ? "diffs" : "all", "") : []),
    [entries, expanded, onlyDiffs],
  );

  // What "expand all" opens: only in this list, the folder comparison in the tab does not change.
  const folders = useMemo(() => (entries ? allFolders(entries) : new Set<string>()), [entries]);
  const allOpen = folders.size === 0 || [...folders].every((f) => expanded.has(f));

  const currentRel = context && currentLeft ? relativeTo(context.left, currentLeft) : null;
  const files = rows.filter((r) => !r.isDir && comparable(r.entry));
  const position = currentRel === null ? -1 : files.findIndex((r) => r.entry.path === currentRel);
  const at = currentRel === null ? -1 : rows.findIndex((r) => r.entry.path === currentRel);
  // It scrolls when the current file or the visible tree changes.
  const reveal = useRevealRequest(at, `${currentRel}:${rows.length}`);

  if (!context && preview) {
    return <PreviewFilesList list={preview} currentLeft={currentLeft} onOpen={onOpen} onToggle={(rel) => onTogglePreview?.(rel)} />;
  }
  if (!context) {
    return (
      <div className="sb-view">
        <h4 className="sb-title">
          <span>{t("sidebar.view.files")}</span>
        </h4>
        <p className="sb-empty">{emptyReason}</p>
      </div>
    );
  }

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  function open(rel: string) {
    const row = rows.find((r) => r.entry.path === rel);
    if (!row || !context) return;
    setHint(null);
    if (row.isDir) toggle(rel);
    else if (comparable(row.entry)) onOpen(joinPath(context.left, rel), joinPath(context.right, rel));
    else if (row.entry.leftKind === null || row.entry.rightKind === null)
      setHint(t("sb.hint.oneSide", { name: row.name }));
    else setHint(t("sb.hint.notText", { name: row.name }));
  }

  return (
    <div className="sb-view">
      <h4 className="sb-title">
        <span>{t("sidebar.view.files")}</span>
        <span>{position >= 0 ? t("sb.position", { n: position + 1, total: files.length }) : files.length}</span>
      </h4>
      <div className="sb-chips" role="group" aria-label={t("sb.shown")}>
        <button type="button" className={onlyDiffs ? "sb-chip on" : "sb-chip"} aria-pressed={onlyDiffs} onClick={() => setOnlyDiffs(true)}>
          {t("sb.chip.diffsOnly")}
        </button>
        <button type="button" className={!onlyDiffs ? "sb-chip on" : "sb-chip"} aria-pressed={!onlyDiffs} onClick={() => setOnlyDiffs(false)}>
          {t("sb.chip.all")}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="sb-empty">{t("sb.noFiles")}</p>
      ) : (
        <VirtualList
          className="sb-list"
          count={rows.length}
          rowHeight={ROW_HEIGHT}
          reveal={reveal}
          renderRow={(i) => {
            const row = rows[i];
            // The folders have no icon of their own here (their status only summarizes that of their files); the files have
            // the same ones as the folder comparison, the identical too ("=").
            const st = row.isDir ? null : statusKind(row.entry);
            const label = st ? statusText(row.entry, t) : undefined;
            const cur = !row.isDir && row.entry.path === currentRel;
            return (
              <button
                type="button"
                className={cur ? "sb-item tree cur" : "sb-item tree"}
                style={{ paddingLeft: 10 + row.depth * 14 }}
                title={row.entry.path}
                aria-current={cur}
                onClick={() => open(row.entry.path)}
              >
                <span className="sb-tw">{row.isDir ? (row.expanded ? "▾" : "▸") : ""}</span>
                <span className={`sb-st st-${st ?? "none"}`} role={st ? "img" : undefined} aria-label={label} title={label}>
                  {st && <StatusIcon status={st} />}
                </span>
                <EntryIcon kind={row.isDir ? "dir" : "file"} open={row.expanded} />
                <span className="sb-text plain">{row.name}</span>
              </button>
            );
          }}
        />
      )}
      {hint && <p className="sb-hint">{hint}</p>}
      <div className="sb-foot">
        <button type="button" className="sb-btn" title={t("sb.expandAll.title")} disabled={allOpen} onClick={() => setExpanded(new Set(folders))}>
          <span className="tb-icon"><ExpandAllIcon /></span>
          {t("dir.tool.expand")}
        </button>
        <button type="button" className="sb-btn" title={t("sb.collapseAll.title")} disabled={expanded.size === 0} onClick={() => setExpanded(new Set())}>
          <span className="tb-icon"><CollapseAllIcon /></span>
          {t("dir.tool.collapse")}
        </button>
      </div>
    </div>
  );
}
