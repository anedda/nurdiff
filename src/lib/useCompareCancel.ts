import { useEffect, useRef } from "react";
import { cancelCompare } from "../api";
import type { CompareState } from "../components/WorkspaceControls";
import { useDelayedFlag } from "./useDelayedFlag";

/**
 * Cancelling the folder comparison: the blue button (after half a second) and Esc cancel it.
 * With the folder preview and no comparison to cancel, Esc instead clears the chosen row.
 */
export function useCompareCancel(o: {
  /** The tab is in the foreground: only then do the shortcuts apply. */
  active: boolean;
  /** The channel of the tab (`useChannel`): only its comparisons are cancelled. */
  channel: string;
  isDirs: boolean;
  /** A comparison (or an in-place comparison) is in progress. */
  running: boolean;
  /** In the preview there is a chosen row, and how to clear it. */
  hasPick: boolean;
  clearPick: () => void;
}): { state: CompareState; requestCancel: () => void } {
  const { active, channel, isDirs, running, hasPick } = o;
  // `clearPick` can be a new function at every render: the latest one is used, without listening to the keyboard again.
  const clearPick = useRef(o.clearPick);
  clearPick.current = o.clearPick;
  const cancellable = isDirs && running;
  const longEnough = useDelayedFlag(cancellable, 500);
  const state: CompareState = !running ? "idle" : longEnough ? "cancellable" : "running";
  const requestCancel = () => void cancelCompare(channel).catch(() => {});
  useEffect(() => {
    if (!active || !cancellable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      void cancelCompare(channel).catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, cancellable, channel]);

  // Esc in the folder preview clears the choice (if there is no comparison to cancel).
  useEffect(() => {
    if (!active || !hasPick || cancellable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target instanceof HTMLInputElement) || (e.target instanceof HTMLSelectElement)) return;
      clearPick.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, hasPick, cancellable]);

  return { state, requestCancel };
}
