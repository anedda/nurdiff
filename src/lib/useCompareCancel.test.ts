import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, stubWindow } from "../test/renderHook";

const cancelCompare = vi.fn((_channel: string) => Promise.resolve(1));
vi.mock("../api", () => ({ cancelCompare: (channel: string) => cancelCompare(channel) }));

const { useCompareCancel } = await import("./useCompareCancel");

interface Props {
  active: boolean;
  channel: string;
  isDirs: boolean;
  running: boolean;
  hasPick: boolean;
  clearPick: () => void;
}
const base: Props = { active: true, channel: "tab7", isDirs: true, running: false, hasPick: false, clearPick: () => {} };

let win: ReturnType<typeof stubWindow>;
beforeEach(() => {
  vi.useFakeTimers();
  cancelCompare.mockClear();
  win = stubWindow();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCompareCancel", () => {
  it("lo stato: fermo, in corso, e annullabile dopo mezzo secondo", () => {
    const h = renderHook((p: Props) => useCompareCancel(p), base);
    expect(h.current.state).toBe("idle");
    h.rerender({ ...base, running: true });
    expect(h.current.state).toBe("running");
    act(() => void vi.advanceTimersByTime(500));
    expect(h.current.state).toBe("cancellable");
    h.rerender({ ...base, running: false });
    expect(h.current.state).toBe("idle");
  });

  it("Esc annulla il confronto di cartelle in corso", () => {
    renderHook((p: Props) => useCompareCancel(p), { ...base, running: true });
    const e = win.press("Escape");
    expect(cancelCompare).toHaveBeenCalledTimes(1);
    expect(cancelCompare).toHaveBeenLastCalledWith("tab7");
    expect(e.defaultPrevented).toBe(true);
    win.press("a");
    expect(cancelCompare).toHaveBeenCalledTimes(1);
  });

  it("un tab in secondo piano o un confronto di file non ascoltano Esc", () => {
    renderHook((p: Props) => useCompareCancel(p), { ...base, running: true, active: false });
    win.press("Escape");
    renderHook((p: Props) => useCompareCancel(p), { ...base, running: true, isDirs: false });
    win.press("Escape");
    expect(cancelCompare).not.toHaveBeenCalled();
  });

  it("senza confronto da annullare, Esc nell'anteprima toglie la riga scelta", () => {
    const clearPick = vi.fn();
    renderHook((p: Props) => useCompareCancel(p), { ...base, hasPick: true, clearPick });
    win.press("Escape");
    expect(clearPick).toHaveBeenCalledTimes(1);
    expect(cancelCompare).not.toHaveBeenCalled();
  });

  it("con un confronto in corso, Esc annulla e non toglie la riga", () => {
    const clearPick = vi.fn();
    renderHook((p: Props) => useCompareCancel(p), { ...base, running: true, hasPick: true, clearPick });
    win.press("Escape");
    expect(cancelCompare).toHaveBeenCalledTimes(1);
    expect(clearPick).not.toHaveBeenCalled();
  });

  it("clearPick è sempre l'ultimo, senza riascoltare la tastiera", () => {
    const first = vi.fn();
    const second = vi.fn();
    const h = renderHook((p: Props) => useCompareCancel(p), { ...base, hasPick: true, clearPick: first });
    h.rerender({ ...base, hasPick: true, clearPick: second });
    win.press("Escape");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("requestCancel chiede l'annullamento", () => {
    const h = renderHook((p: Props) => useCompareCancel(p), { ...base, running: true });
    h.current.requestCancel();
    expect(cancelCompare).toHaveBeenCalledTimes(1);
  });
});
