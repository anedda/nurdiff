import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { clamp, wheelDelta } from "./wheel";

/**
 * The two panes of the comparison scroll together: the position, the wheel and the height of the visible window
 * (on which the rows to draw depend). `hasRows` and `unified` say when the panes are recreated.
 */
export function useScrollSync(rowHeight: number, hasRows: boolean, unified: boolean) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);

  // Height of the visible window (needed to know which rows to draw).
  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    setScrollTop(el.scrollTop); // the panes are recreated when the comparison has rows again
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasRows, unified]);

  // The two panes scroll together: what happens in one is repeated in the other.
  // When the position is assigned to a pane, it in turn generates a scroll event
  // (the "echo"), which arrives late: if in the meantime the other has gone ahead (smooth scrolling
  // by wheel or trackpad) the echo would bring it back and the view jumps. So the assigned
  // position is remembered and the event that brings it back is ignored.
  const assigned = useRef(new Map<HTMLDivElement, { top: number; left: number }>());
  const follow = useCallback((source: HTMLDivElement, target: HTMLDivElement | null) => {
    setScrollTop(source.scrollTop);
    const echo = assigned.current.get(source);
    if (echo) {
      assigned.current.delete(source);
      if (Math.abs(source.scrollTop - echo.top) <= 1 && Math.abs(source.scrollLeft - echo.left) <= 1) {
        return;
      }
    }
    if (!target) return;
    const moveTop = Math.abs(target.scrollTop - source.scrollTop) > 0.5;
    const moveLeft = Math.abs(target.scrollLeft - source.scrollLeft) > 0.5;
    if (!moveTop && !moveLeft) return;
    if (moveTop) target.scrollTop = source.scrollTop;
    if (moveLeft) target.scrollLeft = source.scrollLeft;
    // The position may have been adjusted by the browser (limits): the real one is remembered.
    assigned.current.set(target, { top: target.scrollTop, left: target.scrollLeft });
  }, []);

  // The wheel moves the two panes together, directly, without going through the browser's
  // animated scrolling: with that the two panes chased each other (jumps and steps back).
  // Dragging the bar and the other ways stay on the path of `follow`.
  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // zoom
      const { dx, dy } = wheelDelta(e, rowHeight, right.clientHeight);
      if (dx === 0 && dy === 0) return;
      e.preventDefault();
      const top = clamp(right.scrollTop + dy, 0, right.scrollHeight - right.clientHeight);
      const leftPos = clamp(right.scrollLeft + dx, 0, right.scrollWidth - right.clientWidth);
      for (const el of [left, right]) {
        el.scrollTop = top;
        el.scrollLeft = leftPos;
        assigned.current.set(el, { top: el.scrollTop, left: el.scrollLeft });
      }
    };
    left.addEventListener("wheel", onWheel, { passive: false });
    right.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      left.removeEventListener("wheel", onWheel);
      right.removeEventListener("wheel", onWheel);
    };
  }, [hasRows, unified, rowHeight]);

  const onLeftScroll = (e: UIEvent<HTMLDivElement>) => follow(e.currentTarget, rightRef.current);
  const onRightScroll = (e: UIEvent<HTMLDivElement>) => follow(e.currentTarget, leftRef.current);

  /** Goes back to the start (new comparison). */
  const resetScroll = useCallback(() => {
    setScrollTop(0);
    leftRef.current?.scrollTo(0, 0);
    rightRef.current?.scrollTo(0, 0);
  }, []);

  return { leftRef, rightRef, scrollTop, viewportHeight, onLeftScroll, onRightScroll, resetScroll };
}
