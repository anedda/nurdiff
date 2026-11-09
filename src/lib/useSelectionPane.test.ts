import { describe, expect, it } from "vitest";
import { paneName } from "./useSelectionPane";

const classes = (...names: string[]) => ({ contains: (n: string) => names.includes(n) });

describe("paneName", () => {
  it("riconosce i tre pannelli dalle classi", () => {
    expect(paneName(classes("pane", "left"))).toBe("left");
    expect(paneName(classes("pane", "right"))).toBe("right");
    // the unified view also has the class "right" (shared styles): "unified" wins
    expect(paneName(classes("pane", "right", "unified"))).toBe("unified");
  });

  it("senza la classe «pane», o senza elemento, non è un pannello", () => {
    expect(paneName(classes("left"))).toBeNull();
    expect(paneName(classes("pane"))).toBeNull();
    expect(paneName(null)).toBeNull();
    expect(paneName(undefined)).toBeNull();
  });
});
