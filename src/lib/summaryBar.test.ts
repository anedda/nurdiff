import { describe, expect, it } from "vitest";
import { barSegments, dirBarSegments } from "./summaryBar";

describe("barSegments", () => {
  it("ordina destra, sinistra, modificate e dà le quote", () => {
    expect(barSegments({ changed: 5, leftOnly: 7, rightOnly: 12 })).toEqual([
      { key: "rightOnly", count: 12, pct: 50 },
      { key: "leftOnly", count: 7, pct: 29 },
      { key: "changed", count: 5, pct: 21 },
    ]);
  });
  it("toglie i segmenti vuoti", () => {
    expect(barSegments({ changed: 3, leftOnly: 0, rightOnly: 0 })).toEqual([{ key: "changed", count: 3, pct: 100 }]);
  });
  it("senza righe diverse non c'è nessun segmento", () => {
    expect(barSegments({ changed: 0, leftOnly: 0, rightOnly: 0 })).toEqual([]);
  });
});

describe("dirBarSegments", () => {
  it("diversi, solo a sinistra, solo a destra, tipo diverso, con le quote", () => {
    expect(dirBarSegments({ different: 50, leftOnly: 25, rightOnly: 20, typeMismatch: 5 })).toEqual([
      { key: "changed", count: 50, pct: 50 },
      { key: "leftOnly", count: 25, pct: 25 },
      { key: "rightOnly", count: 20, pct: 20 },
      { key: "typeMismatch", count: 5, pct: 5 },
    ]);
  });
  it("toglie i vuoti e non ha segmenti senza differenze", () => {
    expect(dirBarSegments({ different: 0, leftOnly: 4, rightOnly: 0, typeMismatch: 0 })).toEqual([{ key: "leftOnly", count: 4, pct: 100 }]);
    expect(dirBarSegments({ different: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0 })).toEqual([]);
  });
});
