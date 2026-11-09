import { useRef, useState, type MutableRefObject } from "react";
import { recompareEntry } from "../api";
import { describeError, type Translate } from "../i18n";
import type { DirStats, ExtFilter } from "../types";
import { useGeneration } from "./generation";
import { marksAfterCompare, statsAfterCompare, swapStats } from "./previewMarks";
import type { PreviewMark, PreviewSelection } from "./previewPick";

/** The comparison of a row came back empty: the entry no longer exists on either side. */
class VanishedError extends Error {}

/**
 * The state of the folder preview tied to the in-place comparisons: the chosen row, the
 * marks of the rows already compared ("=", "≈", "≠", "…" in progress, "!" failed) and the summary of the
 * folders compared.
 */
export function usePreviewMarks(
  preview: { left: string; right: string } | null,
  working: MutableRefObject<boolean>,
  t: Translate,
  /** The comparison of a row was cancelled. */
  onCancelled: () => void,
  /** The file filter in use: it also applies to the in-place comparison. */
  filter: ExtFilter,
  /** The channel of the tab: Cancel in another tab does not stop this comparison. */
  channel: string,
) {
  const [sel, setSel] = useState<PreviewSelection | null>(null);
  const [marks, setMarks] = useState<ReadonlyMap<string, PreviewMark>>(() => new Map());
  // Summary of the in-place comparison of a folder of the preview (by path).
  const [stats, setStats] = useState<ReadonlyMap<string, DirStats>>(() => new Map());
  // A comparison in progress gives a result for the folders it started with: other folders or a new read
  // (`generation`) make it useless, a swap (`swaps`) only inverts its summaries.
  const generation = useGeneration();
  const swaps = useRef(0);

  /** Compares a row of the preview in place: it only shows its mark, "=", "≈" or "≠". */
  async function compare(rel: string) {
    const view = preview;
    if (!view || working.current) return;
    const set = (mark: PreviewMark | null) =>
      setMarks((m) => {
        const n = new Map(m);
        if (mark === null) n.delete(rel);
        else n.set(rel, mark);
        return n;
      });
    const stale = generation.start();
    const swapsAtStart = swaps.current;
    set("busy");
    try {
      const entries = await recompareEntry(view.left, view.right, rel, filter, channel);
      if (stale()) return;
      if (entries === null) {
        // Cancelled: the row stays as it was, without the "…" mark.
        set(null);
        onCancelled();
        return;
      }
      if (entries.length === 0) throw new VanishedError();
      setMarks((m) => marksAfterCompare(m, rel, entries, (reason) => t("dir.unreadable", { reason })));
      setStats((s) => statsAfterCompare(s, rel, entries, (swaps.current - swapsAtStart) % 2 !== 0));
    } catch (e) {
      if (stale()) return;
      set({ error: e instanceof VanishedError ? t("preview.vanished") : describeError(e, t) });
    }
  }

  return {
    sel,
    setSel,
    marks,
    stats,
    compare,
    /** New folders: the choice, the marks and the summaries are gone. */
    reset: () => {
      generation.bump();
      setSel(null);
      setMarks(new Map());
      setStats(new Map());
    },
    /** The content was read again: the marks and the summaries are no longer valid (the choice stays). */
    clearResults: () => {
      generation.bump();
      setMarks(new Map());
      setStats(new Map());
    },
    /** The folders swapped sides: the marks stay, the summaries are inverted. */
    swapSides: () => {
      swaps.current += 1;
      setStats((s) => swapStats(s));
    },
  };
}
