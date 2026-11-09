import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "../test/renderHook";
import { useDelayedFlag } from "./useDelayedFlag";

describe("useDelayedFlag", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("diventa vero solo dopo `ms` di fila", () => {
    const h = renderHook(({ on }) => useDelayedFlag(on, 500), { on: false });
    expect(h.current).toBe(false);
    h.rerender({ on: true });
    expect(h.current).toBe(false);
    act(() => void vi.advanceTimersByTime(499));
    expect(h.current).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(h.current).toBe(true);
  });

  it("torna falso subito, e il tempo riparte da capo", () => {
    const h = renderHook(({ on }) => useDelayedFlag(on, 500), { on: true });
    act(() => void vi.advanceTimersByTime(500));
    expect(h.current).toBe(true);
    h.rerender({ on: false });
    expect(h.current).toBe(false);
    h.rerender({ on: true });
    act(() => void vi.advanceTimersByTime(300));
    expect(h.current).toBe(false); // it does not count the time from before
    act(() => void vi.advanceTimersByTime(200));
    expect(h.current).toBe(true);
  });

  it("uno spegnimento prima del tempo annulla l'attesa", () => {
    const h = renderHook(({ on }) => useDelayedFlag(on, 500), { on: true });
    act(() => void vi.advanceTimersByTime(300));
    h.rerender({ on: false });
    act(() => void vi.advanceTimersByTime(1000));
    expect(h.current).toBe(false);
  });
});
