import { describe, expect, it } from "vitest";
import { renderHook } from "../test/renderHook";
import { Generation, useGeneration } from "./generation";

describe("Generation", () => {
  it("un lavoro iniziato prima di bump è superato, uno iniziato dopo no", () => {
    const g = new Generation();
    const before = g.start();
    expect(before()).toBe(false);
    g.bump();
    const after = g.start();
    expect(before()).toBe(true);
    expect(after()).toBe(false);
  });

  it("useGeneration dà sempre la stessa", () => {
    const h = renderHook(() => useGeneration(), undefined);
    const first = h.current;
    h.rerender(undefined);
    expect(h.current).toBe(first);
  });
});
