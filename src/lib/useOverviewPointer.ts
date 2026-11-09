import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { nearestHunk, type Hunk } from "./hunks";

/** A click on the overview within this many pixels of a block selects it. */
export const CLICK_TOLERANCE_PX = 6;
/** Below this distance (px) a movement with the button pressed is still a click. */
const DRAG_THRESHOLD_PX = 4;

/** The scroll position that brings the point `ratio` (0–1) of the file to the centre of the window. */
export function overviewScrollTop(ratio: number, total: number, rowHeight: number, viewportHeight: number): number {
  return ratio * total * rowHeight - viewportHeight / 2;
}

/**
 * The overview (the strip with the block marks) also acts as the vertical scroll bar, because
 * that of the panes is hidden: dragging it scrolls, a still click selects the nearby block (the
 * marks are too thin to be targets, so landing within a few pixels is enough) or brings the centre
 * of the window to that point of the file.
 */
export function useOverviewPointer(opts: {
  scrollerRef: RefObject<HTMLDivElement>;
  hunks: Hunk[];
  total: number;
  rowHeight: number;
  onGoTo: (hunk: number) => void;
}) {
  const { scrollerRef, hunks, total, rowHeight, onGoTo } = opts;
  const drag = useRef<{ startY: number; moved: boolean } | null>(null);

  type Pointer = { clientY: number; currentTarget: HTMLDivElement };
  const ratioOf = (e: Pointer) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { rect, ratio: (e.clientY - rect.top) / rect.height };
  };
  const scrollTo = (e: Pointer) => {
    const el = scrollerRef.current;
    if (!el) return;
    const { ratio } = ratioOf(e);
    el.scrollTop = overviewScrollTop(Math.max(0, Math.min(1, ratio)), total, rowHeight, el.clientHeight);
  };
  const click = (e: Pointer) => {
    const el = scrollerRef.current;
    if (!el) return;
    const { rect, ratio } = ratioOf(e);
    const near = nearestHunk(hunks, ratio * total, (CLICK_TOLERANCE_PX / rect.height) * total);
    if (near >= 0) onGoTo(near);
    else el.scrollTop = overviewScrollTop(ratio, total, rowHeight, el.clientHeight);
  };

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { startY: e.clientY, moved: false };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      scrollTo(e);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) click(e);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };
}
