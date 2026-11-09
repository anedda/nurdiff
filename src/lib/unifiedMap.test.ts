import { describe, expect, it } from "vitest";
import { splitToUnified, unifiedToSplit } from "./unifiedMap";

// Side-by-side rows: 0 1 [2 3] 4 5 [6] 7  ->  unified: 0 1 [2 3 4 5] 6 7 [8 9] 10
const hunks = [
  { start: 2, end: 4 },
  { start: 6, end: 7 },
];
const spans = [
  { start: 2, end: 6 },
  { start: 8, end: 10 },
];

describe("passaggio tra vista affiancata e unificata", () => {
  it("le righe fuori dai blocchi si spostano dello scarto dei blocchi precedenti", () => {
    expect(splitToUnified(0, hunks, spans)).toBe(0);
    expect(splitToUnified(1, hunks, spans)).toBe(1);
    expect(splitToUnified(4, hunks, spans)).toBe(6);
    expect(splitToUnified(5, hunks, spans)).toBe(7);
    expect(splitToUnified(7, hunks, spans)).toBe(10);
    expect(unifiedToSplit(6, hunks, spans)).toBe(4);
    expect(unifiedToSplit(7, hunks, spans)).toBe(5);
    expect(unifiedToSplit(10, hunks, spans)).toBe(7);
  });

  it("una riga dentro un blocco passa all'inizio del blocco", () => {
    expect(splitToUnified(3, hunks, spans)).toBe(2);
    expect(splitToUnified(6, hunks, spans)).toBe(8);
    expect(unifiedToSplit(4, hunks, spans)).toBe(2);
    expect(unifiedToSplit(9, hunks, spans)).toBe(6);
  });

  it("senza blocchi le posizioni coincidono", () => {
    expect(splitToUnified(5, [], [])).toBe(5);
    expect(unifiedToSplit(5, [], [])).toBe(5);
  });
});
