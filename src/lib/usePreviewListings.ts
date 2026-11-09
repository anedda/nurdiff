import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listDirectory } from "../api";
import type { ExtFilter, Side } from "../types";
import { buildPreviewRows, key, nextExpandStep, pendingLoads, swapCache, type Listing, type PreviewRow } from "./previewTree";
import { joinPath } from "./tree";
import { useRootsChange } from "./useRootsChange";

/** How many folders a click on Expand opens at most (the others stay closed). */
export const EXPAND_LIMIT = 500;
/** How many it opens at a time: the reads start in groups, not all together. */
const EXPAND_BATCH = 50;

/**
 * The content of the two folders of the preview, read when needed: chosen folders, open ones and
 * reopening in groups (Expand). Changing folders starts over; swapping their sides reuses what
 * has already been read.
 */
export function usePreviewListings(left: string, right: string, filter: ExtFilter) {
  const [cache, setCache] = useState<Record<string, Listing>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // The folders open in the sidebar: a separate tree that shares the reads (`cache`).
  const [sideExpanded, setSideExpanded] = useState<Set<string>>(() => new Set());
  // Expand: how many folders it can still open (0 = it is not expanding) and whether it stopped at the limit.
  const [autoExpand, setAutoExpand] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  // To discard the answers read for chosen folders before the current ones.
  const filterKey = JSON.stringify(filter);
  const current = useRef(`${left}\0${right}\0${filterKey}`);
  current.current = `${left}\0${right}\0${filterKey}`;

  const load = useCallback(
    (side: Side, rel: string) => {
      const forRoots = `${left}\0${right}\0${filterKey}`;
      const root = side === "left" ? left : right;
      const k = key(side, rel);
      setCache((c) => ({ ...c, [k]: "loading" }));
      listDirectory(rel === "" ? root : joinPath(root, rel), filter)
        .then((items) => {
          if (current.current === forRoots) setCache((c) => ({ ...c, [k]: items }));
        })
        .catch((e) => {
          if (current.current === forRoots) setCache((c) => ({ ...c, [k]: { error: e } }));
        });
    },
    [left, right, filter, filterKey],
  );

  useRootsChange(
    left,
    right,
    () => setCache(swapCache),
    () => {
      setCache({});
      setExpanded(new Set());
      setSideExpanded(new Set());
      setAutoExpand(0);
      setLimitReached(false);
    },
  );

  const rows = useMemo(() => buildPreviewRows(cache, expanded, { left, right }), [cache, expanded, left, right]);

  const sideRows = useMemo(() => buildPreviewRows(cache, sideExpanded, { left, right }), [cache, sideExpanded, left, right]);

  // Reads everything that is needed (by the preview and the sidebar) and has not been read yet.
  useEffect(() => {
    const seen = new Set<string>();
    for (const p of [...pendingLoads(rows, cache, { left, right }), ...pendingLoads(sideRows, cache, { left, right })]) {
      const k = key(p.side, p.rel);
      if (seen.has(k)) continue;
      seen.add(k);
      load(p.side, p.rel);
    }
  }, [rows, sideRows, cache, left, right, load]);

  // Expand: opens the folders in groups, as soon as those of the previous group have been read, up to the limit.
  useEffect(() => {
    if (autoExpand <= 0) return;
    const step = nextExpandStep(rows, autoExpand, EXPAND_BATCH);
    if (step.kind === "wait") return;
    if (step.kind === "done") {
      setAutoExpand(0);
      return;
    }
    setExpanded((prev) => new Set([...prev, ...step.rels]));
    setAutoExpand(step.remaining);
    if (step.remaining <= 0) setLimitReached(true);
  }, [rows, autoExpand]);

  const toggle = (row: PreviewRow) => {
    if (!row.isDir) return;
    const open = !expanded.has(row.rel);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(row.rel);
      else next.delete(row.rel);
      return next;
    });
  };
  /** Opens a folder and all those that contain it (the map of the preview enters a folder: its content must be read). */
  const openPath = (rel: string) => {
    const parts = rel.split("/");
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });
  };
  /** Opens or closes a folder in the sidebar tree (it does not touch that of the preview). */
  const toggleSide = (rel: string) => {
    if (!sideRows.some((r) => r.rel === rel && r.isDir)) return;
    setSideExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(rel)) next.add(rel);
      return next;
    });
  };
  const expandAll = () => {
    setLimitReached(false);
    setAutoExpand(EXPAND_LIMIT);
  };
  const collapseAll = () => {
    setAutoExpand(0);
    setLimitReached(false);
    setExpanded(new Set());
  };
  /** Rereads the chosen folders and the open ones (the openings stay). */
  const reload = () => setCache({});

  return { rows, sideRows, cache, autoExpand, limitReached, toggle, openPath, toggleSide, expandAll, collapseAll, reload };
}
