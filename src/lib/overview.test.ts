import { describe, expect, it } from "vitest";
import { overviewMarks, type Hunk } from "./hunks";

const hunk = (start: number, end: number, kind: Hunk["kind"] = "changed"): Hunk => ({
  start,
  end,
  kind,
  leftAt: 0,
  rightAt: 0,
});

describe("overviewMarks", () => {
  it("non produce segni per un file vuoto o senza blocchi", () => {
    expect(overviewMarks([], 100)).toEqual([]);
    expect(overviewMarks([hunk(0, 1)], 0)).toEqual([]);
  });

  it("un segno per blocco quando sono lontani", () => {
    const marks = overviewMarks([hunk(10, 12), hunk(500, 501, "leftOnly")], 1000, 100);
    expect(marks).toEqual([
      { index: 0, start: 10, end: 12, kind: "changed" },
      { index: 1, start: 500, end: 501, kind: "leftOnly" },
    ]);
  });

  it("fonde i blocchi che cadono nella stessa fetta", () => {
    // 1000 rows in 10 slices: rows 0-99 are the first slice
    const marks = overviewMarks([hunk(1, 2), hunk(5, 8), hunk(95, 99)], 1000, 10);
    expect(marks).toEqual([{ index: 0, start: 1, end: 99, kind: "changed" }]);
  });

  it("un segno fuso di tipi diversi diventa 'modificato'", () => {
    const marks = overviewMarks([hunk(1, 2, "leftOnly"), hunk(5, 6, "rightOnly")], 1000, 10);
    expect(marks).toHaveLength(1);
    expect(marks[0].kind).toBe("changed");
  });

  it("un segno fuso dello stesso tipo conserva il tipo", () => {
    const marks = overviewMarks([hunk(1, 2, "leftOnly"), hunk(5, 6, "leftOnly")], 1000, 10);
    expect(marks[0].kind).toBe("leftOnly");
  });

  it("limita il numero di segni anche con moltissimi blocchi", () => {
    const hunks = Array.from({ length: 50_000 }, (_, i) => hunk(i * 2, i * 2 + 1));
    const marks = overviewMarks(hunks, 100_000, 800);
    expect(marks.length).toBeLessThanOrEqual(800);
    expect(marks[0].index).toBe(0);
  });
});
