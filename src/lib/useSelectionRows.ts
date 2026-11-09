import { useEffect, useState, type RefObject } from "react";
import type { Side } from "../types";
import { selectedRows } from "./copySelection";
import { paneName } from "./useSelectionPane";

/** The rows of a pane that the selected text takes. */
export interface SelectedRows {
  side: Side;
  first: number;
  last: number;
}

/**
 * The block of rows the text selection takes in one of the two side-by-side panes (`null` if nothing is selected, if the
 * selection is in both panes or in the unified view). Like `useSelectionPane`, it follows `selectionchange` with a small
 * delay, and the state changes only if the block does, so it does not redraw while the pointer moves inside the same rows.
 */
export function useSelectionRows(root: RefObject<HTMLElement>): SelectedRows | null {
  const [rows, setRows] = useState<SelectedRows | null>(null);
  useEffect(() => {
    let timer: number | null = null;
    const read = () => {
      timer = null;
      const sel = window.getSelection();
      const host = root.current;
      let next: SelectedRows | null = null;
      if (sel && host && !sel.isCollapsed && sel.rangeCount > 0) {
        const paneOf = (node: Node | null) => {
          const el = node instanceof Element ? node : (node?.parentElement ?? null);
          const found = el?.closest(".pane") ?? null;
          return found && host.contains(found) ? found : null;
        };
        const pane = paneOf(sel.anchorNode);
        const name = pane ? paneName(pane.classList) : null;
        if (pane && pane === paneOf(sel.focusNode) && (name === "left" || name === "right")) {
          const block = selectedRows(pane, sel);
          if (block) next = { side: name, ...block };
        }
      }
      setRows((prev) => (prev?.side === next?.side && prev?.first === next?.first && prev?.last === next?.last ? prev : next));
    };
    const onChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(read, 60);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [root]);
  return rows;
}
