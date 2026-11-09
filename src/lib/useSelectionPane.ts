import { useEffect, useState, type RefObject } from "react";

/** Which pane (`left`, `right`, `unified`) the classes of a `.pane` element name; `null` if it is not one. */
export function paneName(classes: { contains(name: string): boolean } | null | undefined): "left" | "right" | "unified" | null {
  if (!classes || !classes.contains("pane")) return null;
  if (classes.contains("unified")) return "unified";
  return classes.contains("left") ? "left" : classes.contains("right") ? "right" : null;
}

/**
 * In which pane of `root` there is selected text (`null` if none, or if the selection is not in a single
 * pane). It follows `selectionchange` with a small delay, so as not to redraw at every movement while dragging.
 */
export function useSelectionPane(root: RefObject<HTMLElement>): "left" | "right" | "unified" | null {
  const [pane, setPane] = useState<"left" | "right" | "unified" | null>(null);
  useEffect(() => {
    let timer: number | null = null;
    const read = () => {
      timer = null;
      const sel = window.getSelection();
      const host = root.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !host) return setPane(null);
      const paneOf = (node: Node | null) => {
        const el = node instanceof Element ? node : (node?.parentElement ?? null);
        const found = el?.closest(".pane") ?? null;
        return found && host.contains(found) ? paneName(found.classList) : null;
      };
      const a = paneOf(sel.anchorNode);
      setPane(a !== null && a === paneOf(sel.focusNode) ? a : null);
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
  return pane;
}
