import { describe, expect, it } from "vitest";
import type { ConflictSegment, ConflictView } from "../types";
import { items, linesOf, nextUnresolved, stepConflict, textOf } from "./conflictView";

const lines = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `r${from + i}`);
const text = (start: number, n: number): ConflictSegment => ({ kind: "text", start, lines: lines(n, start) });
const conflict = (index: number, start: number, kind: "unresolved" | "ours" = "unresolved"): ConflictSegment => ({
  kind: "conflict",
  index,
  start,
  oursLabel: "HEAD",
  theirsLabel: "altro",
  ours: ["a"],
  base: null,
  theirs: ["b"],
  resolution: { kind },
  result: ["a"],
});
const view = (segments: ConflictSegment[]): ConflictView => ({
  id: 1,
  path: "/m",
  segments,
  total: segments.filter((s) => s.kind === "conflict").length,
  unresolved: segments.filter((s) => s.kind === "conflict" && s.resolution.kind === "unresolved").length,
  dirty: false,
  canUndo: false,
});

describe("items: le righe senza conflitto si piegano", () => {
  it("un tratto lungo tra due conflitti tiene 3 righe per parte e piega il resto", () => {
    const out = items([conflict(0, 1), text(7, 20), conflict(1, 27)]);
    expect(out.map((i) => i.type)).toEqual(["conflict", "lines", "gap", "lines", "conflict"]);
    expect(out[1]).toMatchObject({ start: 7, lines: ["r7", "r8", "r9"] });
    expect(out[2]).toMatchObject({ type: "gap", count: 14 });
    expect(out[3]).toMatchObject({ start: 24, lines: ["r24", "r25", "r26"] });
  });

  it("all'inizio e alla fine del file tiene solo le righe vicine al conflitto", () => {
    const out = items([text(1, 10), conflict(0, 11), text(12, 10)]);
    expect(out[0]).toMatchObject({ type: "gap", count: 7 });
    expect(out[1]).toMatchObject({ type: "lines", start: 8, lines: ["r8", "r9", "r10"] });
    expect(out[3]).toMatchObject({ type: "lines", start: 12, lines: ["r12", "r13", "r14"] });
    expect(out[4]).toMatchObject({ type: "gap", count: 7 });
  });

  it("un tratto corto resta intero e un tratto aperto non si piega", () => {
    expect(items([conflict(0, 1), text(7, 7), conflict(1, 14)]).map((i) => i.type)).toEqual(["conflict", "lines", "conflict"]);
    const long: ConflictSegment[] = [conflict(0, 1), text(7, 30), conflict(1, 37)];
    const out = items(long, new Set(["t1"]));
    expect(out.map((i) => i.type)).toEqual(["conflict", "lines", "conflict"]);
    expect(out[1]).toMatchObject({ lines: lines(30, 7) });
  });

  it("un file senza conflitti e lungo si piega tutto tranne niente (nessun conflitto vicino)", () => {
    expect(items([text(1, 50)]).map((i) => i.type)).toEqual(["gap"]);
    expect(items([text(1, 1)]).map((i) => i.type)).toEqual(["lines"]);
  });
});

describe("navigazione tra i conflitti", () => {
  const v = view([text(1, 2), conflict(0, 3, "ours"), conflict(1, 4), conflict(2, 5, "ours"), conflict(3, 6)]);

  it("avanti e indietro girano intorno", () => {
    expect(stepConflict(v, -1, 1)).toBe(0);
    expect(stepConflict(v, 3, 1)).toBe(0);
    expect(stepConflict(v, 0, -1)).toBe(3);
    expect(stepConflict(view([text(1, 2)]), -1, 1)).toBeNull();
  });

  it("il primo conflitto da risolvere, da un punto in poi, tornando all'inizio", () => {
    expect(nextUnresolved(v, 0)).toBe(1);
    expect(nextUnresolved(v, 2)).toBe(3);
    expect(nextUnresolved(v, 4)).toBe(1);
    expect(nextUnresolved(view([conflict(0, 1, "ours")]), 0)).toBeNull();
  });
});

describe("testo scritto a mano", () => {
  it("un testo vuoto non ha righe, e le righe si dividono su ogni a capo", () => {
    expect(linesOf("")).toEqual([]);
    expect(linesOf("a\r\nb\nc")).toEqual(["a", "b", "c"]);
    expect(linesOf("a\n")).toEqual(["a", ""]);
    expect(textOf(["a", "b"])).toBe("a\nb");
  });
});
