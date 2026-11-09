import { describe, expect, it } from "vitest";
import type { DirListing, EntryKind } from "../types";
import type { PairedEntry } from "./previewMerge";
import { filterRows, isPreviewFilter, previewMatches, swapFilter } from "./previewFilter";

const item = (name: string, kind: EntryKind): DirListing => ({ name, kind, size: 0, modified: null });
const both = (name: string, l: EntryKind = "file", r: EntryKind = "file"): PairedEntry => ({ name, left: item(name, l), right: item(name, r) });
const leftOnly = (name: string): PairedEntry => ({ name, left: item(name, "file"), right: null });
const rightOnly = (name: string): PairedEntry => ({ name, left: null, right: item(name, "file") });

describe("filtri dell'anteprima", () => {
  it("sono disponibili solo quelli che non hanno bisogno dei contenuti", () => {
    for (const f of ["all", "noOrphans", "orphans", "leftOrphans", "rightOrphans"] as const) expect(isPreviewFilter(f)).toBe(true);
    for (const f of ["diffs", "same", "minor", "diffsNoOrphans", "leftNewer", "rightNewer"] as const)
      expect(isPreviewFilter(f)).toBe(false);
  });

  it("orfani: voci presenti da un lato solo", () => {
    expect(previewMatches(leftOnly("a"), "orphans")).toBe(true);
    expect(previewMatches(rightOnly("a"), "orphans")).toBe(true);
    expect(previewMatches(both("a"), "orphans")).toBe(false);
    expect(previewMatches(leftOnly("a"), "leftOrphans")).toBe(true);
    expect(previewMatches(rightOnly("a"), "leftOrphans")).toBe(false);
    expect(previewMatches(rightOnly("a"), "rightOrphans")).toBe(true);
    expect(previewMatches(both("a"), "noOrphans")).toBe(true);
    expect(previewMatches(leftOnly("a"), "noOrphans")).toBe(false);
  });

  it("i filtri che servono i contenuti non lasciano passare nulla", () => {
    for (const f of ["diffs", "same", "minor"] as const) expect(previewMatches(both("a"), f)).toBe(false);
  });

  it("scambiando i lati cambiano solo gli orfani di sinistra e di destra", () => {
    expect(swapFilter("leftOrphans")).toBe("rightOrphans");
    expect(swapFilter("rightOrphans")).toBe("leftOrphans");
    for (const f of ["all", "orphans", "noOrphans", "diffs"] as const) expect(swapFilter(f)).toBe(f);
  });
});

describe("filterRows", () => {
  // d/  (open)          d/x.txt (on the left)   d/y.txt (in common)   e/ (closed, in common)   z.txt (on the right)
  const rows = [
    { pair: both("d", "dir", "dir"), depth: 0 },
    { pair: leftOnly("x.txt"), depth: 1 },
    { pair: both("y.txt"), depth: 1 },
    { pair: both("e", "dir", "dir"), depth: 0 },
    { pair: rightOnly("z.txt"), depth: 0 },
  ];
  const names = (r: { pair: PairedEntry }[]) => r.map((x) => x.pair.name);

  it("senza filtro restano tutte", () => {
    expect(names(filterRows(rows, "all"))).toEqual(["d", "x.txt", "y.txt", "e", "z.txt"]);
  });
  it("orfani: le voci che corrispondono e le cartelle che le contengono", () => {
    expect(names(filterRows(rows, "orphans"))).toEqual(["d", "x.txt", "z.txt"]);
    expect(names(filterRows(rows, "leftOrphans"))).toEqual(["d", "x.txt"]);
    expect(names(filterRows(rows, "rightOrphans"))).toEqual(["z.txt"]);
  });
  it("una cartella chiusa nasconde i figli: non si sa se ha orfani", () => {
    expect(names(filterRows(rows, "orphans"))).not.toContain("e");
  });
  it("senza orfani: le voci in comune, cartelle comprese", () => {
    expect(names(filterRows(rows, "noOrphans"))).toEqual(["d", "y.txt", "e"]);
  });
  it("nessuna corrispondenza: elenco vuoto", () => {
    expect(filterRows(rows, "diffs")).toEqual([]);
  });
});
