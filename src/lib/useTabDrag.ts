import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DRAG_THRESHOLD, dropSlot } from "./tabDrag";

/** A tab, as far as needed to drag it: the Home does not move. */
interface DraggableTab {
  id: number;
  home?: boolean;
}

/** The tab being dragged: how far it has moved, where it would land and where the drop mark is. */
export interface TabDrag {
  id: number;
  dx: number;
  slot: number;
  mark: number;
}

/**
 * Dragging of the tabs: the tab follows the pointer, a mark shows where it will land, and only on release does the order
 * change (`onMove`). Pointer events are used, not `draggable`: with the system file drop
 * active, HTML dragging does not work everywhere. Esc cancels it.
 */
export function useTabDrag(o: {
  tabsRef: RefObject<DraggableTab[]>;
  /** The dragged tab comes to the foreground as soon as the drag begins. */
  onActivate: (id: number) => void;
  /** Released at the position `slot` (index among the tabs that are not the Home, without the tab itself). */
  onMove: (id: number, slot: number) => void;
}) {
  const { tabsRef, onActivate, onMove } = o;
  const barRef = useRef<HTMLDivElement>(null);
  const tabEls = useRef(new Map<number, HTMLDivElement>());
  const dragInfo = useRef<{ id: number; startX: number; startScroll: number; x: number; started: boolean; pointerId: number } | null>(null);
  const dragTimer = useRef<number | null>(null);
  /** Right after a drag the click on the tab must not activate it again. */
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<TabDrag | null>(null);

  function dragGeometry(id: number, x: number) {
    const bar = barRef.current;
    const tabs = tabsRef.current ?? [];
    const others = tabs.filter((t) => !t.home && t.id !== id);
    const els = others.map((t) => tabEls.current.get(t.id)).filter((e): e is HTMLDivElement => !!e);
    const slot = dropSlot(els.map((e) => { const r = e.getBoundingClientRect(); return (r.left + r.right) / 2; }), x);
    let edge = 0;
    if (slot < els.length) edge = els[slot].getBoundingClientRect().left;
    else if (els.length) edge = els[els.length - 1].getBoundingClientRect().right;
    else {
      const home = tabs.find((t) => t.home);
      const el = home ? tabEls.current.get(home.id) : undefined;
      edge = el ? el.getBoundingClientRect().right : 0;
    }
    const b = bar?.getBoundingClientRect();
    return { slot, mark: b && bar ? edge - b.left + bar.scrollLeft : 0 };
  }

  function updateDrag() {
    const d = dragInfo.current;
    if (!d || !d.started) return;
    const scroll = barRef.current?.scrollLeft ?? 0;
    setDrag({ id: d.id, dx: d.x - d.startX + (scroll - d.startScroll), ...dragGeometry(d.id, d.x) });
  }

  function endDrag(commit: boolean) {
    const d = dragInfo.current;
    dragInfo.current = null;
    if (dragTimer.current !== null) {
      window.clearInterval(dragTimer.current);
      dragTimer.current = null;
    }
    if (d?.started) {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      if (commit) onMove(d.id, dragGeometry(d.id, d.x).slot);
    }
    setDrag(null);
  }

  // The events are listened to on the window (not with setPointerCapture): so a simple click
  // still reaches the tab button, and the drag follows the pointer even outside the bar.
  const dragHandlers = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: (e: PointerEvent) => void } | null>(null);

  function stopListening() {
    const h = dragHandlers.current;
    if (!h) return;
    window.removeEventListener("pointermove", h.move);
    window.removeEventListener("pointerup", h.up);
    window.removeEventListener("pointercancel", h.cancel);
    dragHandlers.current = null;
  }

  function onTabPointerDown(e: ReactPointerEvent<HTMLDivElement>, t: DraggableTab) {
    if (t.home || e.button !== 0 || (e.target as HTMLElement).closest(".doctab-close")) return;
    stopListening();
    dragInfo.current = { id: t.id, startX: e.clientX, startScroll: barRef.current?.scrollLeft ?? 0, x: e.clientX, started: false, pointerId: e.pointerId };
    const h = {
      move: (ev: PointerEvent) => onTabPointerMove(ev),
      up: () => { stopListening(); endDrag(true); },
      cancel: () => { stopListening(); endDrag(false); },
    };
    dragHandlers.current = h;
    window.addEventListener("pointermove", h.move);
    window.addEventListener("pointerup", h.up);
    window.addEventListener("pointercancel", h.cancel);
  }

  function onTabPointerMove(e: PointerEvent) {
    const d = dragInfo.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    if (!d.started) {
      if (Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD) return;
      d.started = true;
      onActivate(d.id);
      // Near the edges the bar scrolls by itself, as long as the button is held down.
      dragTimer.current = window.setInterval(() => {
        const cur = dragInfo.current;
        const bar = barRef.current;
        if (!cur || !bar) return;
        const r = bar.getBoundingClientRect();
        if (cur.x < r.left + 32) bar.scrollLeft -= 12;
        else if (cur.x > r.right - 32) bar.scrollLeft += 12;
        else return;
        updateDrag();
      }, 30);
    }
    updateDrag();
  }

  // During the drag Esc cancels it; the functions are those of the last render, read from the reference.
  const dragApi = useRef({ stopListening, endDrag });
  dragApi.current = { stopListening, endDrag };
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragApi.current.stopListening();
        dragApi.current.endDrag(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);

  /** For the `ref` attribute of each tab: it is used to measure its position. */
  const registerTab = (id: number) => (el: HTMLDivElement | null) => {
    if (el) tabEls.current.set(id, el);
    else tabEls.current.delete(id);
  };

  return { barRef, drag, suppressClick, onTabPointerDown, registerTab };
}
