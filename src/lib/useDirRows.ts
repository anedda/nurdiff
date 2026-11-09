import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { recompareEntry } from "../api";
import { describeError, type Translate } from "../i18n";
import type { DirDiff, ExtFilter } from "../types";
import { isExtFilterActive } from "./extFilter";
import { useGeneration } from "./generation";
import { applyEntries, emptiedByFilter } from "./tree";

/** The folder comparison shown, with the folders it came from. */
export interface DirView {
  diff: DirDiff;
  left: string;
  right: string;
  /** The file filter the comparison was made with (it also applies to the comparison of a single row). */
  filter: ExtFilter;
}

/**
 * The state of the rows of the folder comparison: the chosen row, the provisional marks ("…" in
 * progress, "!" failed) and the rows compared again that the filter must not hide right away.
 */
export function useDirRows(
  dirView: DirView | null,
  setDirView: Dispatch<SetStateAction<DirView | null>>,
  working: MutableRefObject<boolean>,
  t: Translate,
  /** The comparison of a row was cancelled. */
  onCancelled: () => void,
  /** The channel of the tab: Cancel in another tab does not stop this comparison. */
  channel: string,
) {
  const [sel, setSel] = useState<string | null>(null);
  const [marks, setMarks] = useState<ReadonlyMap<string, "busy" | { error: string }>>(() => new Map());
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set());
  // A new comparison (also of the same folders, with another filter) makes the rows in progress stale.
  const generation = useGeneration();

  /** Compares a row in place: it updates its mark, the folders that contain it and the totals. */
  async function compare(rel: string) {
    const view = dirView;
    if (!view || working.current) return;
    const { left: l, right: r } = view;
    const stale = generation.start();
    setMarks((m) => new Map(m).set(rel, "busy"));
    try {
      const found = await recompareEntry(l, r, rel, view.filter, channel);
      if (stale()) return;
      if (found === null) {
        // Cancelled: the row stays as it was, without the "…" mark.
        setMarks((m) => {
          const n = new Map(m);
          n.delete(rel);
          return n;
        });
        onCancelled();
        return;
      }
      // As in the full comparison, a folder without files that pass the filter has no row.
      const updated = emptiedByFilter(found, isExtFilterActive(view.filter)) ? [] : found;
      setDirView((v) => (v && v.left === l && v.right === r ? { ...v, diff: applyEntries(v.diff, rel, updated) } : v));
      setKeep((k) => new Set(k).add(rel));
      setMarks((m) => {
        const n = new Map(m);
        n.delete(rel);
        return n;
      });
    } catch (e) {
      if (stale()) return;
      setMarks((m) => new Map(m).set(rel, { error: describeError(e, t) }));
    }
  }

  return {
    sel,
    setSel,
    marks,
    keep,
    compare,
    /** The filter changed: the kept rows are no longer needed. */
    clearKeep: () => setKeep(new Set()),
    /** A new comparison: the marks and the kept rows are removed. */
    reset: () => {
      generation.bump();
      setMarks(new Map());
      setKeep(new Set());
    },
  };
}
