import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, FakePane, renderHook, stubResizeObserver } from "../test/renderHook";
import { useScrollSync } from "./useScrollSync";

interface Props {
  hasRows: boolean;
  unified: boolean;
}

let left: FakePane;
let right: FakePane;
let ro: ReturnType<typeof stubResizeObserver>;

beforeEach(() => {
  left = new FakePane();
  right = new FakePane();
  ro = stubResizeObserver();
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
});
afterEach(() => vi.unstubAllGlobals());

/** Renders the hook, attaches the two fake panes and redraws so that the effects see them. */
function mount(extra: Partial<Props> = {}) {
  const h = renderHook((p: Props) => useScrollSync(20, p.hasRows, p.unified), { hasRows: false, unified: false, ...extra });
  (h.current.leftRef as { current: unknown }).current = left;
  (h.current.rightRef as { current: unknown }).current = right;
  h.rerender({ hasRows: true, unified: false, ...extra });
  return h;
}
const wheel = (target: FakePane, extra: Record<string, unknown> = {}) => {
  const e = Object.assign(new Event("wheel", { cancelable: true }), { deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false, ctrlKey: false, metaKey: false, ...extra });
  act(() => void target.dispatchEvent(e));
  return e;
};
const scrolled = (el: FakePane) => ({ currentTarget: el }) as never;

describe("useScrollSync", () => {
  it("legge l'altezza della finestra visibile e la posizione, e li aggiorna al ridimensionamento", () => {
    right.clientHeight = 300;
    right.scrollTop = 40;
    const h = mount();
    expect(h.current.viewportHeight).toBe(300);
    expect(h.current.scrollTop).toBe(40);
    right.clientHeight = 500;
    ro.trigger();
    expect(h.current.viewportHeight).toBe(500);
  });

  it("scorrendo un pannello l'altro lo segue (anche in orizzontale), e la posizione si aggiorna", () => {
    const h = mount();
    right.scrollTop = 120;
    right.scrollLeft = 30;
    act(() => h.current.onRightScroll(scrolled(right)));
    expect(left.scrollTop).toBe(120);
    expect(left.scrollLeft).toBe(30);
    expect(h.current.scrollTop).toBe(120);
    left.scrollTop = 500;
    act(() => h.current.onLeftScroll(scrolled(left)));
    expect(right.scrollTop).toBe(500);
  });

  it("l'eco dello scorrimento assegnato non riporta indietro l'altro pannello", () => {
    const h = mount();
    right.scrollTop = 100;
    act(() => h.current.onRightScroll(scrolled(right))); // left = 100, and it is remembered that it was assigned
    right.scrollTop = 160; // in the meantime the user has gone ahead (smooth wheel)
    act(() => h.current.onLeftScroll(scrolled(left))); // the echo of left at 100 arrives
    expect(right.scrollTop).toBe(160); // it does not jump back
    // a real scroll of left after the echo, instead, is followed
    left.scrollTop = 300;
    act(() => h.current.onLeftScroll(scrolled(left)));
    expect(right.scrollTop).toBe(300);
  });

  it("la rotella sposta i due pannelli insieme, e blocca lo scorrimento del browser", () => {
    const h = mount();
    const e = wheel(left, { deltaY: 100 });
    expect(e.defaultPrevented).toBe(true);
    expect(left.scrollTop).toBe(100);
    expect(right.scrollTop).toBe(100);
    wheel(right, { deltaY: 100, deltaMode: 1 }); // 100 rows of 20 px
    expect(right.scrollTop).toBe(Math.min(100 + 2000, 2000 - 400));
    expect(h.current.scrollTop).toBeGreaterThanOrEqual(0);
  });

  it("la rotella con Ctrl (zoom) o senza movimento non si tocca; con Maiusc scorre di lato", () => {
    mount();
    expect(wheel(left, { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(left, { deltaY: 0 }).defaultPrevented).toBe(false);
    wheel(left, { deltaY: 50, shiftKey: true });
    expect(right.scrollLeft).toBe(50);
    expect(right.scrollTop).toBe(0);
  });

  it("la rotella non supera i bordi", () => {
    mount();
    wheel(left, { deltaY: -500 });
    expect(right.scrollTop).toBe(0);
    wheel(left, { deltaY: 99999 });
    expect(right.scrollTop).toBe(right.scrollHeight - right.clientHeight);
  });

  it("resetScroll riporta all'inizio la posizione e i due pannelli", () => {
    const h = mount();
    right.scrollTop = 800;
    left.scrollTop = 800;
    act(() => h.current.onRightScroll(scrolled(right)));
    act(() => h.current.resetScroll());
    expect(h.current.scrollTop).toBe(0);
    expect(left.scrollTop).toBe(0);
    expect(right.scrollTop).toBe(0);
  });

  it("smontando non ascolta più", () => {
    const h = mount();
    h.unmount();
    expect(ro.count()).toBe(0);
    expect(wheel(left, { deltaY: 100 }).defaultPrevented).toBe(false);
  });
});
