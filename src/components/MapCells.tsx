import { useT } from "../i18n/context";
import { statusText } from "../lib/dirReport";
import { formatSize } from "../lib/format";
import {
  MIN_AREA,
  MIN_SIDE,
  GAP,
  GAP_INNER,
  RADIUS,
  RADIUS_INNER,
  BADGE_KINDS,
  badgesOf,
  layoutGroup,
  memberEntry,
  memberPath,
  nameOf,
  inset,
  radius,
  stateClass,
} from "../lib/mapLayout";
import type { Member } from "../lib/mapLayout";
import type { MapGroup, MapLeaf, Rect } from "../lib/treemap";
import type { DirEntryDiff } from "../types";
import EntryIcon from "./EntryIcon";

/** What the clicks on the cells do: whoever uses them decides what choosing, opening or asking for the menu means. */
export interface CellActions {
  onSelect: (path: string | null) => void;
  /** Double click on a file. */
  onOpen: (entry: DirEntryDiff) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirEntryDiff) => void;
}

/** The label of the small ones' cell: "+N files", "+N folders" or, if mixed, "+N items". */
function moreLabelFor(t: (k: string, p?: Record<string, number>) => string, files: number, folders: number): string {
  const n = files + folders;
  return t(folders === 0 ? "map.more.files" : files === 0 ? "map.more.folders" : "map.more.items", { n });
}

/** The common status of a group of entries, or "mixed" if they are not all the same. */
function sharedClass(entries: (DirEntryDiff | undefined)[]): string {
  const statuses = entries.map((e) => e?.status ?? "different");
  return statuses.every((s) => s === statuses[0]) ? stateClass(entries[0]) : "mixed";
}

export function MapLeafCell({ leaf, r, inner, selected, onSelect, onOpen, onContextMenu }: { leaf: MapLeaf; r: Rect; inner?: boolean; selected: boolean } & CellActions) {
  const t = useT();
  const { entry } = leaf;
  const name = nameOf(entry.path);
  const sizes = [entry.leftSize, entry.rightSize].filter((s): s is number => s !== null).map(formatSize);
  const title = `${entry.path}\n${statusText(entry, t)}${sizes.length ? `\n${sizes.join(" | ")}` : ""}`;
  const box = inset(r, inner ? GAP_INNER : GAP);
  return (
    <div
      className={`map-cell ${stateClass(entry)}${selected ? " selected" : ""}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: radius(box, inner ? RADIUS_INNER : RADIUS) }}
      role="button"
      tabIndex={-1}
      title={title}
      aria-label={`${name}: ${statusText(entry, t)}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entry.path);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(entry);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(entry.path);
        onContextMenu(e, entry);
      }}
    >
      {box.w >= 56 && box.h >= 18 && <span className="map-label">{name}</span>}
      {box.w >= 56 && box.h >= 40 && <span className="map-label map-size">{formatSize(Math.max(entry.leftSize ?? 0, entry.rightSize ?? 0))}</span>}
    </div>
  );
}

/** The cell that groups the entries of the level that are too small to be drawn on their own. */
export function MapClusterCell({ rect, cluster, selected, onOpenList }: { rect: Rect; cluster: Member[]; selected: boolean; onOpenList: () => void }) {
  const t = useT();
  const names = cluster.map((m) => nameOf(memberPath(m))).join(" · ");
  const box = inset(rect, GAP);
  return (
    <div
      className={`map-cell cluster ${sharedClass(cluster.map(memberEntry))}${selected ? " selected" : ""}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: radius(box, RADIUS) }}
      role="button"
      tabIndex={-1}
      title={`${t("map.small.title")}\n${names}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpenList();
      }}
    >
      {box.w >= 56 && box.h >= 18 && (
        <span className="map-label">{moreLabelFor(t, cluster.filter((m) => "file" in m).length, cluster.filter((m) => "group" in m).length)}</span>
      )}
      {box.w >= 120 && box.h >= 40 && <span className="map-label map-names">{names}</span>}
    </div>
  );
}

/** A drawn folder: header (icon, name, size, badge) and the cells of its files. */
export function MapGroupBox({
  rect,
  group: g,
  selected,
  onEnter,
  onShowPanel,
  ...actions
}: {
  rect: Rect;
  group: MapGroup;
  /** The chosen path (the folder or one of its files). */
  selected: string | null;
  onEnter: (path: string) => void;
  onShowPanel: () => void;
} & CellActions) {
  const t = useT();
  const { onSelect, onContextMenu } = actions;
  const box = inset(rect, GAP);
  const cells = layoutGroup(g, box.w, box.h);
  const badge = badgesOf(g.leaves);
  // Only the kinds present, and as many as the header has room for (one per 90 px beyond the first 100).
  const shown = BADGE_KINDS.filter((k) => badge[k] > 0).slice(0, Math.max(1, Math.floor((box.w - 100) / 90)));
  return (
    <div
      className={`map-group ${g.entry?.status ?? "different"}${g.path === selected ? " selected" : ""}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: radius(box, 2 * RADIUS) }}
      title={`${g.path}\n${t("map.zoom")}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(g.path);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEnter(g.path);
      }}
      onContextMenu={(e) => {
        if (!g.entry) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(g.path);
        onContextMenu(e, g.entry);
      }}
    >
      <div className="map-group-head">
        <span className="map-group-icon" aria-hidden="true"><EntryIcon kind="dir" /></span>
        <span className="map-label">{g.name}/</span>
        {box.w >= 90 && <span className="map-group-size">{formatSize(g.value)}</span>}
        {box.w >= 170 && (
          <span className="map-badges">
            {shown.length === 0 ? (
              <span className="map-badge identical">{t("map.badge.identical")}</span>
            ) : (
              shown.map((k) => (
                <span key={k} className={`map-badge ${k}`}>
                  {k === "different" || k === "minor" ? t(`map.badge.${k}`, { count: badge[k] }) : t(`map.chip.${k}`, { count: badge[k] })}
                </span>
              ))
            )}
          </span>
        )}
      </div>
      {cells.map((c) => {
        if (c.w < MIN_SIDE || c.h < MIN_SIDE || c.w * c.h < MIN_AREA) return null;
        if ("more" in c.key) {
          const names = c.key.more.map((l) => nameOf(l.entry.path)).join(" · ");
          const cb = inset(c, GAP_INNER);
          return (
            <div
              key="more"
              className={`map-cell cluster inner ${sharedClass(c.key.more.map((l) => l.entry))}`}
              style={{ left: cb.x, top: cb.y, width: cb.w, height: cb.h, borderRadius: radius(cb, RADIUS_INNER) }}
              role="button"
              tabIndex={-1}
              title={`${t("map.small.title")}\n${names}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(g.path);
                onShowPanel();
              }}
            >
              {cb.w >= 40 && cb.h >= 16 && <span className="map-label">{moreLabelFor(t, c.key.more.length, 0)}</span>}
            </div>
          );
        }
        const leaf = c.key.leaf;
        return <MapLeafCell key={leaf.entry.path} leaf={leaf} r={c} inner selected={leaf.entry.path === selected} {...actions} />;
      })}
    </div>
  );
}
