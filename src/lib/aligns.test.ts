import { describe, expect, it } from "vitest";
import { swapAligns } from "./aligns";

describe("swapAligns", () => {
  it("gira ogni coppia", () => {
    expect(swapAligns([[1, 2]])).toEqual([[2, 1]]);
  });
  it("rimette le coppie in ordine rispetto al nuovo lato sinistro", () => {
    expect(swapAligns([[1, 5], [4, 9], [7, 12]])).toEqual([[5, 1], [9, 4], [12, 7]]);
    expect(swapAligns([[3, 1], [8, 2]])).toEqual([[1, 3], [2, 8]]);
  });
  it("non cambia l'elenco di partenza e gestisce il vuoto", () => {
    const original: [number, number][] = [[2, 1]];
    swapAligns(original);
    expect(original).toEqual([[2, 1]]);
    expect(swapAligns([])).toEqual([]);
  });
});
