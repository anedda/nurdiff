import { useEffect, useState } from "react";
import { useT } from "../i18n/context";
import { countOf, countSign, diffLineCount, needsCount } from "../lib/diffCounts";
import type { DiffCount } from "../lib/diffCounts";
import { statusText } from "../lib/dirReport";
import { formatDate, formatSize } from "../lib/format";
import { LIST_LIMIT, memberEntry, memberPath, memberValue, nameOf, parentOf, sortLeaves, stateClass } from "../lib/mapLayout";
import type { LeafSort, Member } from "../lib/mapLayout";
import { newerSide, statusKind } from "../lib/tree";
import type { MapGroup, MapLeaf } from "../lib/treemap";
import type { DirEntryDiff } from "../types";
import EntryIcon from "./EntryIcon";
import { ChevronDownIcon, ChevronUpIcon, StatusIcon } from "./icons";

/** Different rows of files: they are requested when the file is chosen (see `useDiffCounts`). */
export interface MapCounts {
  counts: Record<string, DiffCount>;
  request: (entry: DirEntryDiff) => void;
  cancel: (entry: DirEntryDiff) => void;
}

/** The actions of the panel. */
interface PanelActions {
  /** "Open in a new tab" (file). */
  onOpen: (entry: DirEntryDiff) => void;
  counts: MapCounts;
  /** A folder with no cells inside (the preview's, not read yet) can be entered. */
  enterFolders?: boolean;
}

/** The detail panel: the chosen entry (file or folder), or the list of the grouped small ones. */
export default function MapPanel({
  entry,
  group,
  cluster,
  siblings,
  props,
  onEnter,
  onPick,
  onClose,
}: {
  entry: DirEntryDiff | undefined;
  group: MapGroup | undefined;
  cluster: Member[] | null;
  /** The entries of the folder of the chosen entry (or of the chosen folder), to move from with a click. */
  siblings: { base: string; leaves: MapLeaf[] } | null;
  props: PanelActions;
  onEnter: (path: string) => void;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { request, cancel } = props.counts;
  const wants = !!entry && needsCount(entry);
  const [sort, setSort] = useState<LeafSort>({ by: "name", dir: "asc" });
  useEffect(() => {
    if (!entry || !wants) return;
    request(entry);
    return () => cancel(entry);
  }, [entry, wants, request, cancel]);

  const head = (
    <div className="mp-head">
      <span className="mp-kicker">{t("map.panel.title")}</span>
      <button type="button" className="mp-close" onClick={onClose} aria-label={t("map.panel.hide")} title={t("map.panel.hide")}>
        ×
      </button>
    </div>
  );

  if (!entry && cluster) {
    return (
      <aside className="map-panel" aria-label={t("map.panel.title")}>
        {head}
        <h3 className="mp-name">{t("map.small", { n: cluster.length })}</h3>
        <p className="mp-hint">{t("map.cluster.hint")}</p>
        <ul className="mp-list">
          {cluster.map((m) => {
            const e = memberEntry(m);
            const path = memberPath(m);
            return (
              <li key={path}>
                <button type="button" className={`mp-item ${stateClass(e)}`} onClick={() => onPick(path)} title={e ? statusText(e, t) : path}>
                  <span className="mp-st"><StatusIcon status={e ? statusKind(e) : "different"} /></span>
                  <span className="mp-item-name">{nameOf(path)}{"group" in m ? "/" : ""}</span>
                  <span className="mp-item-size">{formatSize(memberValue(m))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  if (!entry) {
    return (
      <aside className="map-panel" aria-label={t("map.panel.title")}>
        {head}
        <p className="mp-hint">{t("map.panel.empty")}</p>
      </aside>
    );
  }

  const isFolder = group !== undefined || entry.leftKind === "dir" || entry.rightKind === "dir";
  const count = countOf(entry, props.counts.counts);
  let diffs: React.ReactNode = "—";
  if (isFolder && group) {
    const different = group.leaves.filter((l) => l.entry.status !== "identical").length;
    diffs = t("map.panel.inFolder", { files: group.leaves.length, diffs: different });
  } else if (wants) {
    const sign = countSign(count, t);
    if (sign) diffs = <span title={sign.title} aria-busy={sign.busy}>{sign.text}</span>;
    else if (typeof count === "object") diffs = t("map.panel.lines", { count: diffLineCount(count) });
  }
  const newer = newerSide(entry);
  const side = (label: string, size: number | null, modified: number | null, mine: "left" | "right") => (
    <div className={`mp-side ${mine}`}>
      <span className="mp-label"><i className="mp-dot" aria-hidden="true" />{label}</span>
      <span className="mp-size">{size === null && modified === null ? "—" : formatSize(size)}</span>
      <span className={newer === mine ? "mp-date mp-newer" : "mp-date"}>{formatDate(modified)}</span>
    </div>
  );
  const parent = parentOf(entry.path);
  // Sorted before the cut at LIST_LIMIT, so that the files shown are the first ones in the chosen order.
  const listed = siblings ? sortLeaves(siblings.leaves, siblings.base, sort).slice(0, LIST_LIMIT) : [];
  // First click on a column: names A to Z, sizes largest first; a second click reverses it.
  const sortBy = (by: LeafSort["by"]) =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: by === "name" ? "asc" : "desc" }));
  const column = (by: LeafSort["by"], label: string) => (
    <button
      type="button"
      className={`mp-col mp-col-${by}${sort.by === by ? " active" : ""}`}
      aria-sort={sort.by === by ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => sortBy(by)}
    >
      {label}
      {sort.by === by && (sort.dir === "asc" ? <ChevronUpIcon /> : <ChevronDownIcon />)}
    </button>
  );
  return (
    <aside className="map-panel" aria-label={t("map.panel.title")}>
      {head}
      <div className="mp-title">
        <span className={`mp-icon ${stateClass(entry)}`} aria-hidden="true">
          <EntryIcon kind={isFolder ? "dir" : "file"} />
        </span>
        <div className="mp-titles">
          <h3 className="mp-name">{nameOf(entry.path)}</h3>
          <p className="mp-path">{parent === "" ? "/" : `${parent}/`}</p>
        </div>
      </div>
      <div className="mp-cards">
        <div className={`mp-card mp-status ${stateClass(entry)}`}>
          <span className="mp-label">{t("map.panel.status")}</span>
          <span className="mp-value"><i className="mp-dot" aria-hidden="true" />{statusText(entry, t)}</span>
        </div>
        <div className="mp-card">
          <span className="mp-label">{t("map.panel.diffs")}</span>
          <span className="mp-value">{diffs}</span>
        </div>
      </div>
      <div className="mp-sides">
        {side(t("map.panel.left"), entry.leftSize, entry.leftModified, "left")}
        {side(t("map.panel.right"), entry.rightSize, entry.rightModified, "right")}
      </div>
      {siblings && siblings.leaves.length > 0 && (
        <section className="mp-siblings-box" aria-label={t("map.panel.siblings")}>
          <div className="mp-siblings-head">
            <span className="mp-label">{t("map.panel.siblings")}</span>
            <span className="mp-count">
              {t("map.panel.siblingsCount", { count: siblings.leaves.length })} · {t(`map.panel.order.${sort.by}.${sort.dir}`)}
            </span>
          </div>
          <div className="mp-table">
          <div className="mp-cols">
            <span className="mp-st-spacer" aria-hidden="true" />
            {column("name", t("map.panel.sortName"))}
            {column("size", t("map.panel.sortSize"))}
          </div>
          <ul className="mp-siblings">
            {listed.map((l) => {
              const path = l.entry.path;
              const rel = siblings.base === "" ? path : path.slice(siblings.base.length + 1);
              return (
                <li key={path}>
                  <button
                    type="button"
                    className={`mp-item ${stateClass(l.entry)}${path === entry.path ? " current" : ""}`}
                    aria-current={path === entry.path}
                    title={`${path}\n${statusText(l.entry, t)}`}
                    onClick={() => onPick(path)}
                  >
                    <span className="mp-st"><StatusIcon status={statusKind(l.entry)} /></span>
                    <span className="mp-item-name">{rel}</span>
                    <span className="mp-item-size">{formatSize(l.value)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          </div>
          {siblings.leaves.length > listed.length && <p className="mp-hint">{t("map.panel.more", { n: siblings.leaves.length - listed.length })}</p>}
        </section>
      )}
      <div className="mp-actions">
        {isFolder ? (
          <button
            type="button"
            className="mp-primary"
            disabled={!group && !props.enterFolders}
            onClick={() => (group || props.enterFolders) && onEnter(group?.path ?? entry.path)}
          >
            {t("map.panel.enter")}
            <kbd>↵</kbd>
          </button>
        ) : (
          <button type="button" className="mp-primary" onClick={() => props.onOpen(entry)}>
            {t("dir.menu.openTab")}
            <kbd>↵</kbd>
          </button>
        )}
      </div>
    </aside>
  );
}
