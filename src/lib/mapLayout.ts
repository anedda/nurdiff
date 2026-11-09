import type { DirEntryDiff } from "../types";
import { clusterValue, splitSmall } from "./mapCluster";
import { statusClass, statusKind } from "./tree";
import { squarify } from "./treemap";
import type { MapGroup, MapLeaf, MapLevel, Placed, Rect } from "./treemap";

/** Height (px) of the header of a folder drawn in the map. */
export const HEADER = 24;
/** How many entries the panel lists at most (the others are only counted). */
export const LIST_LIMIT = 200;
/** Below these sizes (px) a cell is not drawn: it would be a dot. */
export const MIN_SIDE = 3;
export const MIN_AREA = 8;
/** Area (px²) below which an element of the level is not readable and goes into the group of small ones. */
export const SMALL_AREA = 900;
/** Corner radius (px) of the cells at the shown level and of those inside a folder. */
export const RADIUS = 6;
export const RADIUS_INNER = 4;

/** Distance (px) per side between cells: at the shown level and inside a folder (between two cells it is double). */
export const GAP = 3;
export const GAP_INNER = 2;
/** Margin (px) between the map and the frame of the pane, and between a folder's border and the cells inside it. */
export const MARGIN = 8;
export const MARGIN_GROUP = 4;

/**
 * The rectangle of a cell shrunk by `max` px per side, so that a space is left between two neighbouring cells. The
 * shrinking grows with the cell: below 30 px of side it is zero (tiny cells, many per folder, must
 * stay drawn), then one pixel every ten up to `max`.
 */
export function inset(r: Rect, max: number): Rect {
  const gap = Math.max(0, Math.min(max, Math.floor((Math.min(r.w, r.h) - 30) / 10)));
  return { x: r.x + gap, y: r.y + gap, w: r.w - 2 * gap, h: r.h - 2 * gap };
}

/** The radius does not exceed a quarter of the smaller side: a small cell does not become a pill. */
export function radius(r: Rect, max: number): number {
  return Math.min(max, Math.floor(Math.min(r.w, r.h) / 4));
}

/** An entry of the shown level: a file or a folder (with its files). */
export type Member = { file: MapLeaf } | { group: MapGroup };
/** What is laid out at the shown level: the entries and, if some are too small, the cell that groups them. */
export type MapItem = Member | { cluster: Member[] };
/** What is laid out inside a folder: a file or the "+N" cell of the files that are too small. */
export type GroupCell = { leaf: MapLeaf } | { more: MapLeaf[] };

export type LeafSort = { by: "name" | "size"; dir: "asc" | "desc" };

/**
 * The files of a folder in the order of the panel list: by the name shown (the path below `base`, ignoring case, digits
 * as numbers) or by size; equal sizes fall back to the name, always A to Z. The input is not changed.
 */
export function sortLeaves(leaves: MapLeaf[], base: string, sort: LeafSort): MapLeaf[] {
  const rel = (l: MapLeaf) => (base === "" ? l.entry.path : l.entry.path.slice(base.length + 1));
  const byName = (a: MapLeaf, b: MapLeaf) => rel(a).localeCompare(rel(b), undefined, { sensitivity: "base", numeric: true }) || (rel(a) < rel(b) ? -1 : rel(a) > rel(b) ? 1 : 0);
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...leaves].sort((a, b) => (sort.by === "name" ? sign * byName(a, b) : sign * (a.value - b.value) || byName(a, b)));
}

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export const memberValue = (m: Member) => ("file" in m ? m.file.value : m.group.value);
export const memberPath = (m: Member) => ("file" in m ? m.file.entry.path : m.group.path);
export const memberEntry = (m: Member): DirEntryDiff | undefined => ("file" in m ? m.file.entry : m.group.entry);

/** The status classes used to colour an entry (without an entry: "different"). */
export function stateClass(entry: DirEntryDiff | undefined): string {
  return entry ? statusClass(entry) : "different";
}

/** The kinds a folder header badge can count, in the order they are shown. */
export const BADGE_KINDS = ["different", "minor", "leftOnly", "rightOnly", "typeMismatch", "notCompared"] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

/** What the header badges say about a folder: how many entries of each kind (identical ones are not counted). */
export function badgesOf(leaves: MapLeaf[]): Record<BadgeKind, number> {
  const n: Record<BadgeKind, number> = { different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0, notCompared: 0 };
  for (const l of leaves) {
    const kind = statusKind(l.entry);
    if (kind !== "identical") n[kind] += 1;
  }
  return n;
}

/**
 * Lays out the level shown in `size`: files and folders with an area proportional to the weight; the elements too
 * small to be read (below `SMALL_AREA`, if there are at least two) become a single cell, last by weight.
 * `small` are the grouped ones, for the panel.
 */
export function layoutLevel(level: MapLevel, size: { w: number; h: number }): { placed: Placed<MapItem>[]; small: Member[] } {
  const members: Member[] = [
    ...level.files.map((f): Member => ({ file: f })),
    ...level.groups.map((g): Member => ({ group: g })),
  ];
  const items = members.map((m) => ({ key: m, value: memberValue(m) })).sort((a, b) => b.value - a.value);
  const frame: Rect = { x: MARGIN, y: MARGIN, w: Math.max(0, size.w - 2 * MARGIN), h: Math.max(0, size.h - 2 * MARGIN) };
  const area = frame.w * frame.h;
  const split = splitSmall(items, area, SMALL_AREA);
  const all: { key: MapItem; value: number }[] = [...split.big];
  if (split.small.length > 0) {
    const total = items.reduce((a, i) => a + i.value, 0);
    all.push({ key: { cluster: split.small.map((s) => s.key) }, value: clusterValue(split.small, total, area, SMALL_AREA) });
    all.sort((a, b) => b.value - a.value);
  }
  return { placed: squarify(all, frame), small: split.small.map((s) => s.key) };
}

/**
 * Lays out the files of a drawn folder of width `w` and height `h` (below the header). Cells that are
 * too small are grouped into a single one, at the bottom, but only if at least one readable cell remains: if
 * none is (small folders with many files) all are drawn, tiny but coloured, because a single
 * grey "+N" cell would hide which folders contain differences.
 */
export function layoutGroup(g: MapGroup, w: number, h: number): Placed<GroupCell>[] {
  // Like `inset`, the margin shrinks with the folder: a small folder keeps its room for the cells.
  const m = Math.max(1, Math.min(MARGIN_GROUP, Math.floor((Math.min(w, h) - 30) / 10)));
  const inner: Rect = { x: m, y: HEADER, w: w - 2 * m, h: h - HEADER - m };
  if (inner.w < 20 || inner.h < 8) return [];
  const leafItems = g.leaves.map((l) => ({ key: l, value: l.value }));
  const clustered = splitSmall(leafItems, inner.w * inner.h, SMALL_AREA);
  const split = clustered.big.length === 0 ? { big: leafItems, small: [] } : clustered;
  const cellItems: { key: GroupCell; value: number }[] = split.big.map((i) => ({ key: { leaf: i.key }, value: i.value }));
  if (split.small.length > 0) {
    const total = leafItems.reduce((a, i) => a + i.value, 0);
    cellItems.push({ key: { more: split.small.map((s) => s.key) }, value: clusterValue(split.small, total, inner.w * inner.h, SMALL_AREA) });
    cellItems.sort((a, b) => b.value - a.value);
  }
  return squarify(cellItems, inner);
}
