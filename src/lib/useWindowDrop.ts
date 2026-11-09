import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { classifyPaths, inTauri, onFileDrag } from "../api";
import type { Translate } from "../i18n";
import { describeError, renderMessage } from "../i18n";
import type { Mode, Side } from "../types";
import { planDrop, sideAt } from "./drop";
import { runsOnPick, type Settings } from "./settings";

/** The drag in progress: how many items and over which half of the window. */
export interface DragState {
  count: number;
  hover: Side | null;
}

/** What is needed to decide what to do with a drop: the most recent state of the tab. */
export interface DropContext {
  active: boolean;
  mode: Mode | null;
  left: string;
  right: string;
  settings: Settings;
  t: Translate;
  runWith: (mode: Mode, left: string, right: string) => Promise<boolean>;
  setMode: (mode: Mode) => void;
  setLeft: (path: string) => void;
  setRight: (path: string) => void;
  showPreview: (left: string, right: string) => void;
}

/**
 * Dragging files and folders onto the window: it follows the Tauri event, shows which half
 * the drop is on and, on release, compares or shows the preview. The events are registered only once:
 * the recent state is read from `latest`.
 */
export function useWindowDrop(
  latest: MutableRefObject<DropContext>,
  working: MutableRefObject<boolean>,
  setError: (message: string | null) => void,
): DragState | null {
  const [drag, setDrag] = useState<DragState | null>(null);
  const hover = useRef<Side | null>(null);

  useEffect(() => {
    if (!inTauri) return;
    const stopNavigation = (e: Event) => e.preventDefault(); // no opening of the file in the window
    window.addEventListener("dragover", stopNavigation);
    window.addEventListener("drop", stopNavigation);

    async function dropped(paths: string[], side: Side | null) {
      const now = latest.current;
      if (!now.active) return;
      if (working.current) {
        setError(now.t("ws.err.busy"));
        return;
      }
      let plan;
      try {
        plan = planDrop(paths, await classifyPaths(paths), { ...now, mode: now.mode ?? "files" }, side);
      } catch (e) {
        setError(describeError(e, now.t));
        return;
      }
      if (!plan.ok) {
        setError(renderMessage(now.t, plan.message));
        return;
      }
      if (now.mode !== null && plan.mode !== now.mode) {
        setError(now.t(now.mode === "files" ? "ws.err.filesTab" : "ws.err.dirsTab"));
        return;
      }
      setError(null);
      now.setMode(plan.mode);
      now.setLeft(plan.left);
      now.setRight(plan.right);
      if (plan.compare && runsOnPick(now.settings, plan.mode)) await now.runWith(plan.mode, plan.left, plan.right);
      else if (plan.mode === "dirs") now.showPreview(plan.left, plan.right);
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;
    onFileDrag((event) => {
      if (!latest.current.active) {
        setDrag(null);
        return;
      }
      if (event.type === "leave") {
        hover.current = null;
        setDrag(null);
        return;
      }
      hover.current = sideAt(event.x, window.innerWidth);
      if (event.type === "drop") {
        setDrag(null);
        void dropped(event.paths, hover.current);
      } else if (event.type === "enter") {
        setDrag({ count: event.paths.length, hover: hover.current });
      } else {
        setDrag((d) => (d ? { ...d, hover: hover.current } : d));
      }
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("dragover", stopNavigation);
      window.removeEventListener("drop", stopNavigation);
    };
    // `latest`, `working` and `setError` are stable references or functions of the caller.
  }, [latest, working, setError]);

  return drag;
}
