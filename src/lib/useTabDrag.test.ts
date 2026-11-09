import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, stubWindow } from "../test/renderHook";
import { useTabDrag } from "./useTabDrag";

const tabs = [{ id: 1, home: true }, { id: 2 }, { id: 3 }, { id: 4 }];

/** A fake element with a fixed position on the bar: each one 100 px wide. */
const box = (left: number) => ({ getBoundingClientRect: () => ({ left, right: left + 100 }) });

let win: ReturnType<typeof stubWindow>;
beforeEach(() => {
  vi.useFakeTimers();
  win = stubWindow();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount() {
  const onActivate = vi.fn();
  const onMove = vi.fn();
  const h = renderHook(() => useTabDrag({ tabsRef: { current: tabs }, onActivate, onMove }), undefined);
  // the bar starts at x = 0 and has not scrolled; the tabs are one after the other: Home 0–100, 2: 100–200, 3: 200–300, 4: 300–400
  (h.current.barRef as { current: unknown }).current = { getBoundingClientRect: () => ({ left: 0, right: 600 }), scrollLeft: 0 };
  tabs.forEach((t, i) => h.current.registerTab(t.id)(box(i * 100) as unknown as HTMLDivElement));
  return { h, onActivate, onMove };
}

const down = (h: ReturnType<typeof mount>["h"], tab: { id: number; home?: boolean }, x: number, extra: Record<string, unknown> = {}) =>
  act(() =>
    h.current.onTabPointerDown(
      { button: 0, clientX: x, pointerId: 1, target: { closest: () => null }, ...extra } as never,
      tab,
    ),
  );
const move = (x: number, pointerId = 1) => {
  const e = Object.assign(new Event("pointermove"), { clientX: x, pointerId });
  act(() => void (window as unknown as EventTarget).dispatchEvent(e));
};
const release = (type = "pointerup") => act(() => void (window as unknown as EventTarget).dispatchEvent(new Event(type)));

describe("useTabDrag", () => {
  it("un movimento sotto la soglia non è un trascinamento", () => {
    const { h, onActivate, onMove } = mount();
    down(h, tabs[1], 150);
    move(153);
    expect(h.current.drag).toBeNull();
    release();
    expect(onActivate).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(h.current.suppressClick.current).toBe(false); // it was a real click
  });

  it("oltre la soglia il tab passa in primo piano e segue il puntatore, col segno dove cadrà", () => {
    const { h, onActivate } = mount();
    down(h, tabs[1], 150);
    move(330); // tab 2 dragged between tabs 3 (centre 250) and 4 (centre 350): after 3
    expect(onActivate).toHaveBeenCalledWith(2);
    expect(h.current.drag).toMatchObject({ id: 2, dx: 180, slot: 1 });
    expect(h.current.drag!.mark).toBe(300); // the mark is on the left edge of tab 4
  });

  it("rilasciando sposta il tab nella posizione indicata, e il clic successivo si ignora una volta", () => {
    const { h, onMove } = mount();
    down(h, tabs[1], 150);
    move(380); // beyond the centre of tab 4 (350): at the end
    release();
    expect(onMove).toHaveBeenCalledWith(2, 2);
    expect(h.current.drag).toBeNull();
    expect(h.current.suppressClick.current).toBe(true);
    act(() => void vi.advanceTimersByTime(0));
    expect(h.current.suppressClick.current).toBe(false);
  });

  it("Esc annulla il trascinamento senza spostare", () => {
    const { h, onMove } = mount();
    down(h, tabs[1], 150);
    move(380);
    win.press("Escape");
    expect(h.current.drag).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
    release(); // the release after the cancellation no longer moves
    expect(onMove).not.toHaveBeenCalled();
  });

  it("l'annullamento del puntatore non sposta", () => {
    const { h, onMove } = mount();
    down(h, tabs[1], 150);
    move(380);
    release("pointercancel");
    expect(onMove).not.toHaveBeenCalled();
    expect(h.current.drag).toBeNull();
  });

  it("la Home, un altro pulsante o la × non iniziano un trascinamento", () => {
    const home = mount();
    down(home.h, tabs[0], 50);
    move(300);
    expect(home.h.current.drag).toBeNull();
    const right = mount();
    down(right.h, tabs[1], 150, { button: 2 });
    move(300);
    expect(right.h.current.drag).toBeNull();
    const close = mount();
    down(close.h, tabs[1], 150, { target: { closest: () => ({}) } });
    move(300);
    expect(close.h.current.drag).toBeNull();
  });

  it("i movimenti di un altro puntatore si ignorano", () => {
    const { h } = mount();
    down(h, tabs[1], 150);
    move(300, 2);
    expect(h.current.drag).toBeNull();
  });

  it("vicino al bordo la barra scorre da sola finché si tiene premuto", () => {
    const { h } = mount();
    const bar = h.current.barRef.current as unknown as { scrollLeft: number };
    down(h, tabs[1], 150);
    move(10); // less than 32 px from the left edge
    act(() => void vi.advanceTimersByTime(60));
    expect(bar.scrollLeft).toBeLessThan(0);
    release();
    const after = bar.scrollLeft;
    act(() => void vi.advanceTimersByTime(300));
    expect(bar.scrollLeft).toBe(after); // after the release it no longer scrolls
  });
});
