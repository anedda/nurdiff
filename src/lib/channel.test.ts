import { describe, expect, it } from "vitest";
import { renderHook } from "../test/renderHook";
import { useChannel } from "./channel";

describe("useChannel", () => {
  it("ogni componente ha il suo canale, che resta lo stesso a ogni disegno", () => {
    const a = renderHook(() => useChannel("tab"), undefined);
    const b = renderHook(() => useChannel("tab"), undefined);
    const first = a.current;
    a.rerender(undefined);
    expect(a.current).toBe(first);
    expect(first).toMatch(/^tab\d+$/);
    expect(b.current).not.toBe(first);
  });
});
