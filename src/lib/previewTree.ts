import type { DirListing, Side } from "../types";
import { mergeListings, type PairedEntry } from "./previewMerge";

/**
 * The logic of the preview tree, without React: rows, reads to do, Expand steps and
 * swapping of the sides. The components and the hooks (`usePreviewListings`, `usePreviewSizes`) use it.
 */

/** The content of a folder read from one side: the entries, the error, or "reading". */
export type Listing = DirListing[] | { error: unknown } | "loading";

/** Size of a folder: being computed, ready or not computable. */
export type DirSize = number | "loading" | "error";

export interface Roots {
  left: string;
  right: string;
}

/** A row of the preview: the same name seen from the left and from the right. */
export interface PreviewRow {
  rel: string;
  depth: number;
  pair: PairedEntry;
  isDir: boolean;
  expanded: boolean;
  /** Folder open but not yet read (from one of the two sides). */
  loading: boolean;
  /** Folder open and unreadable from at least one side. */
  failed: boolean;
}

export const SIDES = ["left", "right"] as const;

/** The key of a folder's data (read or computed) by side and relative path. */
export const key = (side: Side, rel: string) => `${side}\0${rel}`;

/** The same key with the sides swapped. */
export const swapKey = (k: string) => (k.startsWith("left\0") ? "right" + k.slice(4) : "left" + k.slice(5));

/** The same two folders with swapped sides (and not two new folders or only one changed). */
export function isSwap(prev: Roots, cur: Roots): boolean {
  return cur.left.trim() !== "" && cur.right.trim() !== "" && cur.left !== cur.right && prev.left === cur.right && prev.right === cur.left;
}

/** The content already read, with swapped sides. Reads in progress are discarded: they are redone. */
export function swapCache(cache: Record<string, Listing>): Record<string, Listing> {
  const out: Record<string, Listing> = {};
  for (const [k, v] of Object.entries(cache)) if (v !== "loading") out[swapKey(k)] = v;
  return out;
}

/** The sizes already computed, with swapped sides (those in progress are redone). */
export function swapSizes(sizes: Record<string, DirSize>): Record<string, DirSize> {
  const out: Record<string, DirSize> = {};
  for (const [k, v] of Object.entries(sizes)) if (v !== "loading") out[swapKey(k)] = v;
  return out;
}

/**
 * The rows of the tree: the entries of the two roots paired by name, with inside those of the
 * open and already read folders. As long as a root has not been read there are no rows.
 */
export function buildPreviewRows(cache: Record<string, Listing>, expanded: ReadonlySet<string>, roots: Roots): PreviewRow[] {
  const out: PreviewRow[] = [];
  const list = (side: Side, rel: string): DirListing[] | null => {
    const v = cache[key(side, rel)];
    return Array.isArray(v) ? v : null;
  };
  const walk = (rel: string, depth: number) => {
    for (const pair of mergeListings(list("left", rel), list("right", rel))) {
      const path = rel === "" ? pair.name : `${rel}/${pair.name}`;
      const isDir = pair.left?.kind === "dir" || pair.right?.kind === "dir";
      const open = isDir && expanded.has(path);
      // Of the two sides, those where the entry is a folder to be read.
      const sides = SIDES.filter((s) => (s === "left" ? pair.left : pair.right)?.kind === "dir");
      const states = open ? sides.map((s) => cache[key(s, path)]) : [];
      const loading = open && states.some((v) => v === undefined || v === "loading");
      const failed = open && states.some((v) => v !== undefined && typeof v === "object" && !Array.isArray(v));
      out.push({ rel: path, depth, pair, isDir, expanded: open, loading, failed });
      if (open && !loading) walk(path, depth + 1);
    }
  };
  if (previewReading(cache, roots) !== "reading") walk("", 0);
  return out;
}

/** State of the reading of the two roots: still in progress, unreadable on one side, or read. */
export function previewReading(cache: Record<string, Listing>, roots: Roots): "reading" | "error" | "ready" {
  const states = SIDES.filter((s) => roots[s].trim()).map((s) => cache[key(s, "")]);
  if (states.some((v) => v === undefined || v === "loading")) return "reading";
  if (states.some((v) => v !== undefined && !Array.isArray(v))) return "error";
  return "ready";
}

/** The rows of the preview as seen by the sidebar (without a comparison state: there is none yet). */
export interface PreviewList {
  rows: PreviewRow[];
  left: string;
  right: string;
  state: "reading" | "error" | "ready";
}

/** The reads still to do: the chosen folders and the open ones that have not been read. */
export function pendingLoads(rows: readonly PreviewRow[], cache: Record<string, Listing>, roots: Roots): { side: Side; rel: string }[] {
  const out: { side: Side; rel: string }[] = [];
  for (const side of SIDES) {
    if (roots[side].trim() && cache[key(side, "")] === undefined) out.push({ side, rel: "" });
  }
  for (const row of rows) {
    if (!row.expanded) continue;
    for (const side of SIDES) {
      const entry = side === "left" ? row.pair.left : row.pair.right;
      if (entry?.kind === "dir" && cache[key(side, row.rel)] === undefined) out.push({ side, rel: row.rel });
    }
  }
  return out;
}

/** What Expand does now: wait for a read, be done, or open more folders. */
export type ExpandStep = { kind: "wait" } | { kind: "done" } | { kind: "open"; rels: string[]; remaining: number };

/**
 * The next step of Expand: wait for the open folders to be read, then open a
 * group of them (at most `batch`, and never more than `budget` in all). `remaining` is the budget that is left.
 */
export function nextExpandStep(rows: readonly PreviewRow[], budget: number, batch: number): ExpandStep {
  if (rows.some((r) => r.expanded && r.loading)) return { kind: "wait" };
  const closed = rows.filter((r) => r.isDir && !r.expanded);
  if (closed.length === 0) return { kind: "done" };
  const rels = closed.slice(0, Math.min(budget, batch)).map((r) => r.rel);
  return { kind: "open", rels, remaining: budget - rels.length };
}
