import { describe, expect, it } from "vitest";
import { clusterValue, levelCounts, splitSmall } from "./mapCluster";
import type { DirEntryDiff, EntryStatus } from "../types";

const entry = (path: string, status: EntryStatus): DirEntryDiff =>
  ({ path, status, leftKind: "file", rightKind: "file", leftSize: 1, rightSize: 1, leftModified: null, rightModified: null }) as DirEntryDiff;

describe("mapCluster", () => {
  it("raggruppa solo i piccoli, e solo se sono almeno due", () => {
    const items = [{ value: 1000 }, { value: 10 }, { value: 5 }];
    // area 10 000 px², minimum 50 px²: the limit is 1015 * 50 / 10 000 ≈ 5.07
    const r = splitSmall(items, 10_000, 50);
    expect(r.small).toEqual([]); // a single small element is not grouped
    expect(r.big).toHaveLength(3);
    // with a higher limit two elements are small and are grouped
    const r2 = splitSmall(items, 10_000, 1_000);
    expect(r2.small.map((i) => i.value)).toEqual([10, 5]);
    expect(r2.big.map((i) => i.value)).toEqual([1000]);
  });

  it("un solo elemento piccolo resta com'è", () => {
    const r = splitSmall([{ value: 1000 }, { value: 1 }], 10_000, 1_000);
    expect(r.small).toEqual([]);
    expect(r.big).toHaveLength(2);
  });

  it("senza area o senza peso non raggruppa nulla", () => {
    expect(splitSmall([{ value: 1 }, { value: 1 }], 0, 100).small).toEqual([]);
    expect(splitSmall([{ value: 0 }, { value: 0 }], 100, 100).small).toEqual([]);
  });

  it("il gruppo dei piccoli ha almeno l'area minima", () => {
    expect(clusterValue([{ value: 1 }, { value: 2 }], 1000, 10_000, 100)).toBe(10);
    expect(clusterValue([{ value: 50 }, { value: 60 }], 1000, 10_000, 100)).toBe(110);
    expect(clusterValue([{ value: 3 }], 1000, 0, 100)).toBe(3);
  });

  it("conta i file per stato, quelli nelle cartelle compresi", () => {
    const level = {
      files: [{ entry: entry("a", "different"), value: 1 }, { entry: entry("b", "identical"), value: 1 }],
      groups: [
        {
          path: "d",
          name: "d",
          entry: undefined,
          value: 2,
          leaves: [{ entry: entry("d/x", "leftOnly"), value: 1 }, { entry: entry("d/y", "different"), value: 1 }],
        },
      ],
    };
    expect(levelCounts(level)).toEqual({ different: 2, leftOnly: 1, rightOnly: 0, typeMismatch: 0, identical: 1, notCompared: 0 });
  });
});
