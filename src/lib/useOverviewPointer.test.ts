import { describe, expect, it, vi } from "vitest";
import type { Hunk } from "./hunks";
import { renderHook } from "../test/renderHook";
import { overviewScrollTop, useOverviewPointer } from "./useOverviewPointer";

describe("overviewScrollTop", () => {
  it("porta il punto scelto al centro della finestra", () => {
    // file of 1000 rows of 20 px, window of 400 px: in the middle of the file the centre falls at 10000 px
    expect(overviewScrollTop(0.5, 1000, 20, 400)).toBe(10_000 - 200);
    expect(overviewScrollTop(0, 1000, 20, 400)).toBe(-200); // the browser brings it back to 0
  });
});

const hunk = (start: number, end: number): Hunk => ({ start, end, kind: "changed", leftAt: 0, rightAt: 0 }) as Hunk;

/** A fake pointer on the overview strip: 200 px tall, starting at y = 0. */
const pointer = (clientY: number) =>
  ({
    clientY,
    pointerId: 1,
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 200 }), setPointerCapture: () => {} },
  }) as never;

function setup() {
  const scroller = { scrollTop: 0, clientHeight: 400 };
  const onGoTo = vi.fn();
  const h = renderHook(
    () =>
      useOverviewPointer({
        scrollerRef: { current: scroller as unknown as HTMLDivElement },
        hunks: [hunk(100, 110), hunk(800, 820)],
        total: 1000,
        rowHeight: 20,
        onGoTo,
      }),
    undefined,
  );
  return { h, scroller, onGoTo };
}

describe("useOverviewPointer (hook)", () => {
  it("un clic a pochi pixel da un blocco lo seleziona", () => {
    const { h, onGoTo, scroller } = setup();
    h.current.onPointerDown(pointer(20)); // 20/200 -> row 100: inside the first block
    h.current.onPointerUp(pointer(20));
    expect(onGoTo).toHaveBeenCalledWith(0);
    expect(scroller.scrollTop).toBe(0);
  });

  it("un clic lontano dai blocchi porta quel punto del file al centro della finestra", () => {
    const { h, onGoTo, scroller } = setup();
    h.current.onPointerDown(pointer(100)); // middle of the strip -> row 500
    h.current.onPointerUp(pointer(100));
    expect(onGoTo).not.toHaveBeenCalled();
    expect(scroller.scrollTop).toBe(overviewScrollTop(0.5, 1000, 20, 400));
  });

  it("trascinando oltre la soglia scorre, e al rilascio non conta come clic", () => {
    const { h, onGoTo, scroller } = setup();
    h.current.onPointerDown(pointer(100));
    h.current.onPointerMove(pointer(102)); // below the threshold: still a click
    expect(scroller.scrollTop).toBe(0);
    h.current.onPointerMove(pointer(150));
    expect(scroller.scrollTop).toBe(overviewScrollTop(0.75, 1000, 20, 400));
    h.current.onPointerMove(pointer(999)); // outside the strip: it stops at the bottom
    expect(scroller.scrollTop).toBe(overviewScrollTop(1, 1000, 20, 400));
    h.current.onPointerUp(pointer(999));
    expect(onGoTo).not.toHaveBeenCalled();
  });

  it("senza tasto premuto il movimento non fa nulla; l'annullamento dimentica il clic", () => {
    const { h, onGoTo, scroller } = setup();
    h.current.onPointerMove(pointer(150));
    expect(scroller.scrollTop).toBe(0);
    h.current.onPointerDown(pointer(20));
    h.current.onPointerCancel();
    h.current.onPointerUp(pointer(20));
    expect(onGoTo).not.toHaveBeenCalled();
  });
});
