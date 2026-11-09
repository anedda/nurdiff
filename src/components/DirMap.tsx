import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/context";
import { levelCounts } from "../lib/mapCluster";
import { MIN_AREA, MIN_SIDE, layoutLevel, parentOf } from "../lib/mapLayout";
import { isDirEntry, type DirFilter } from "../lib/tree";
import { mapLevel } from "../lib/treemap";
import type { DirEntryDiff } from "../types";
import { MapClusterCell, MapGroupBox, MapLeafCell } from "./MapCells";
import MapPanel from "./MapPanel";
import type { MapCounts } from "./MapPanel";

interface Props {
  entries: DirEntryDiff[];
  filter: DirFilter;
  pattern: string;
  keep?: ReadonlySet<string>;
  selected: string | null;
  onSelect: (path: string | null) => void;
  /** Double click (or Enter) on a file. */
  onOpen: (entry: DirEntryDiff) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirEntryDiff) => void;
  /** Different rows of a file: they are requested when the file is chosen. */
  counts: MapCounts;
  /**
   * The map of the preview (before the comparison): the folders not read are cells of their own, and entering one asks
   * the preview to read it (`onEnter`); `reading` has the folders being read.
   */
  preview?: { reading: ReadonlySet<string>; onEnter: (path: string) => void };
}

/**
 * "Map" view of the comparison made: files as cells with area proportional to size,
 * grouped by folder, coloured by status. A click chooses the cell (and shows its details in the
 * panel), a double click opens the file or enters the folder; Backspace goes up one level.
 */
export default function DirMap({ entries, filter, pattern, keep, selected, onSelect, onOpen, onContextMenu, counts, preview }: Props) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [at, setAt] = useState("");
  const [panel, setPanel] = useState(true);
  // The panel shows the list of the grouped small ones (no entry chosen).
  const [clusterOpen, setClusterOpen] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const foldersAsLeaves = preview !== undefined;
  const level = useMemo(() => mapLevel(entries, at, filter, pattern, keep, foldersAsLeaves), [entries, at, filter, pattern, keep, foldersAsLeaves]);
  const byPath = useMemo(() => new Map(entries.map((e) => [e.path, e])), [entries]);
  const chips = useMemo(() => levelCounts(level), [level]);

  const { placed, small } = useMemo(() => layoutLevel(level, size), [level, size]);

  const crumbs = at === "" ? [] : at.split("/");
  const empty = level.files.length === 0 && level.groups.length === 0;
  const entry = selected === null ? undefined : byPath.get(selected);
  const selectedGroup = selected === null ? undefined : level.groups.find((g) => g.path === selected);
  // The folder of the chosen entry: its entries, to move from one to another from the panel.
  const siblings = useMemo(() => {
    if (selected === null) return null;
    const owner = level.groups.find((g) => g.path === selected || g.leaves.some((l) => l.entry.path === selected));
    if (owner) return { base: owner.path, leaves: owner.leaves };
    return level.files.some((f) => f.entry.path === selected) ? { base: at, leaves: level.files } : null;
  }, [level, selected, at]);
  // The counts of the level repeat in the summary above, until they say something else: they are only shown then.
  // In the preview they are always there: they are also the legend of the hatching ("not compared").
  const showChips = preview !== undefined || at !== "" || filter !== "all" || pattern.trim() !== "";

  const enter = (path: string) => {
    preview?.onEnter(path);
    setAt(path);
    setClusterOpen(false);
    onSelect(null);
  };
  /** Double click on a cell: a file opens; a folder that is a cell (the preview's, not read yet) is entered. */
  const open = (e: DirEntryDiff) => (isDirEntry(e) && e.status !== "typeMismatch" ? enter(e.path) : onOpen(e));
  const goTo = (path: string) => {
    setAt(path);
    setClusterOpen(false);
  };
  const up = () => {
    if (at === "") return;
    const from = at;
    goTo(parentOf(at));
    onSelect(from);
  };
  const select = (path: string | null) => {
    setClusterOpen(false);
    onSelect(path);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "Backspace") {
      up();
    } else if (e.key === "Enter") {
      if (selectedGroup) enter(selectedGroup.path);
      else if (entry && !(entry.leftKind === "dir" || entry.rightKind === "dir")) onOpen(entry);
      else if (entry && preview) enter(entry.path);
      else return;
    } else {
      return;
    }
    e.preventDefault();
  }

  const chipList: { key: keyof typeof chips; cls: string }[] = [
    { key: "different", cls: "different" },
    { key: "leftOnly", cls: "leftOnly" },
    { key: "rightOnly", cls: "rightOnly" },
    { key: "typeMismatch", cls: "typeMismatch" },
    { key: "identical", cls: "identical" },
    { key: "notCompared", cls: "notCompared" },
  ];

  return (
    <div className="dir-map-view" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="map-bar">
        <button type="button" className="map-up" onClick={up} disabled={at === ""} title={t("map.up")} aria-label={t("map.up")}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
          </svg>
        </button>
        <nav className="map-crumbs" aria-label={t("map.crumbs")}>
          <button type="button" className="map-crumb" onClick={() => goTo("")} disabled={at === ""}>
            {t("map.root")}
          </button>
          {crumbs.map((name, i) => {
            const path = crumbs.slice(0, i + 1).join("/");
            return (
              <span key={path} className="map-crumb-item">
                <span aria-hidden="true">›</span>
                <button type="button" className="map-crumb" onClick={() => goTo(path)} disabled={i === crumbs.length - 1}>
                  {name}
                </button>
              </span>
            );
          })}
        </nav>
        {showChips && (
          <div className="map-chips">
            {chipList.map(({ key, cls: c }) =>
              chips[key] > 0 ? (
                <span key={key} className={`map-chip ${c}`}>
                  <i className="map-dot" aria-hidden="true" />
                  {t(`map.chip.${key}`, { count: chips[key] })}
                </span>
              ) : null,
            )}
          </div>
        )}
        <button
          type="button"
          className={panel ? "map-panel-toggle on" : "map-panel-toggle"}
          aria-pressed={panel}
          title={t("map.panel.toggle")}
          aria-label={t("map.panel.toggle")}
          onClick={() => setPanel((p) => !p)}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M10 3v10" />
          </svg>
        </button>
      </div>
      <div className="map-body">
        <div className="dir-map" ref={box} onClick={() => select(null)}>
          {empty && <p className="notice">{preview && (preview.reading.has(at) || entries.length === 0) ? t("map.reading") : t("map.empty")}</p>}
          {placed.map((p) => {
            if (p.w < MIN_SIDE || p.h < MIN_SIDE || p.w * p.h < MIN_AREA) return null;
            if ("cluster" in p.key) {
              return (
                <MapClusterCell
                  key="cluster"
                  rect={p}
                  cluster={p.key.cluster}
                  selected={clusterOpen && selected === null}
                  onOpenList={() => {
                    onSelect(null);
                    setClusterOpen(true);
                    setPanel(true);
                  }}
                />
              );
            }
            if ("file" in p.key) {
              const leaf = p.key.file;
              return <MapLeafCell key={leaf.entry.path} leaf={leaf} r={p} selected={leaf.entry.path === selected} onSelect={select} onOpen={open} onContextMenu={onContextMenu} />;
            }
            return (
              <MapGroupBox
                key={p.key.group.path}
                rect={p}
                group={p.key.group}
                selected={selected}
                onEnter={enter}
                onShowPanel={() => setPanel(true)}
                onSelect={select}
                onOpen={open}
                onContextMenu={onContextMenu}
              />
            );
          })}
        </div>
        {panel && (
          <MapPanel
            entry={entry}
            group={selectedGroup}
            cluster={clusterOpen ? small : null}
            siblings={siblings}
            props={{ onOpen, counts, enterFolders: preview !== undefined }}
            onEnter={enter}
            onPick={select}
            onClose={() => setPanel(false)}
          />
        )}
      </div>
    </div>
  );
}
