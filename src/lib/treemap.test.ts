import { describe, expect, it } from "vitest";
import type { DirEntryDiff } from "../types";
import { mapLevel, squarify } from "./treemap";

function file(path: string, size: number, status: DirEntryDiff["status"] = "different"): DirEntryDiff {
  return { path, status, leftKind: "file", rightKind: "file", leftSize: size, rightSize: size, leftModified: null, rightModified: null };
}
function dir(path: string, status: DirEntryDiff["status"] = "different"): DirEntryDiff {
  return { path, status, leftKind: "dir", rightKind: "dir", leftSize: null, rightSize: null, leftModified: null, rightModified: null };
}

describe("squarify", () => {
  it("riempie il rettangolo con aree proporzionali ai valori", () => {
    const items = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ key: i, value }));
    const rect = { x: 10, y: 20, w: 600, h: 400 };
    const placed = squarify(items, rect);
    expect(placed).toHaveLength(items.length);
    const total = items.reduce((a, i) => a + i.value, 0);
    for (const p of placed) {
      const v = items[p.key].value;
      expect((p.w * p.h) / (rect.w * rect.h)).toBeCloseTo(v / total, 6);
      expect(p.x).toBeGreaterThanOrEqual(rect.x - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(rect.y - 1e-6);
      expect(p.x + p.w).toBeLessThanOrEqual(rect.x + rect.w + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(rect.y + rect.h + 1e-6);
    }
    expect(placed.reduce((a, p) => a + p.w * p.h, 0)).toBeCloseTo(rect.w * rect.h, 4);
  });

  it("non dispone nulla senza elementi o senza spazio", () => {
    expect(squarify([], { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
    expect(squarify([{ key: 1, value: 1 }], { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
  });

  it("un elemento solo prende tutto", () => {
    expect(squarify([{ key: "a", value: 5 }], { x: 0, y: 0, w: 30, h: 20 })).toEqual([{ key: "a", x: 0, y: 0, w: 30, h: 20 }]);
  });
});

describe("mapLevel", () => {
  const entries = [
    dir("a"),
    file("a/x.txt", 100),
    file("a/y.txt", 50, "identical"),
    dir("a/sub"),
    file("a/sub/z.txt", 10),
    file("top.txt", 7, "identical"),
    file("vuoto.txt", 0),
  ];

  it("raggruppa per sottocartella di primo livello, a qualsiasi profondità", () => {
    const lv = mapLevel(entries, "", "all", "");
    expect(lv.files.map((f) => f.entry.path)).toEqual(["top.txt", "vuoto.txt"]);
    expect(lv.groups).toHaveLength(1);
    expect(lv.groups[0].path).toBe("a");
    expect(lv.groups[0].value).toBe(160);
    expect(lv.groups[0].leaves.map((l) => l.entry.path)).toEqual(["a/x.txt", "a/y.txt", "a/sub/z.txt"]);
  });

  it("entra in una cartella", () => {
    const lv = mapLevel(entries, "a", "all", "");
    expect(lv.files.map((f) => f.entry.path)).toEqual(["a/x.txt", "a/y.txt"]);
    expect(lv.groups.map((g) => g.path)).toEqual(["a/sub"]);
  });

  it("i file vuoti pesano 1", () => {
    expect(mapLevel(entries, "", "all", "").files.find((f) => f.entry.path === "vuoto.txt")?.value).toBe(1);
  });

  it("applica filtro e testo; le cartelle senza file visibili spariscono", () => {
    const diffs = mapLevel(entries, "", "diffs", "");
    expect(diffs.groups[0].leaves.map((l) => l.entry.path)).toEqual(["a/x.txt", "a/sub/z.txt"]);
    expect(mapLevel(entries, "", "same", "").groups[0].leaves.map((l) => l.entry.path)).toEqual(["a/y.txt"]);
    expect(mapLevel(entries, "", "all", "zzz")).toEqual({ files: [], groups: [] });
    expect(mapLevel(entries, "", "all", "Z.TXT").groups[0].leaves).toHaveLength(1);
  });

  it("le righe tenute restano anche se il filtro le escluderebbe", () => {
    const lv = mapLevel(entries, "", "diffs", "", new Set(["top.txt"]));
    expect(lv.files.map((f) => f.entry.path)).toEqual(["top.txt", "vuoto.txt"]);
  });
});

describe("mapLevel con le cartelle come celle (anteprima)", () => {
  const entries = [
    dir("a", "notCompared"),
    file("a/x.txt", 10, "notCompared"),
    dir("b", "notCompared"),
    { ...dir("c", "leftOnly"), leftSize: 500, rightKind: null },
    file("f.txt", 20, "notCompared"),
  ];

  it("senza l'opzione le cartelle senza file dentro non compaiono", () => {
    const level = mapLevel(entries, "", "all", "");
    expect(level.files.map((f) => f.entry.path)).toEqual(["f.txt"]);
    expect(level.groups.map((g) => g.path)).toEqual(["a"]);
  });

  it("con l'opzione una cartella senza voci dentro è una cella col peso della sua dimensione (1 se non nota)", () => {
    const level = mapLevel(entries, "", "all", "", undefined, true);
    expect(level.files.map((f) => [f.entry.path, f.value])).toEqual([
      ["c", 500],
      ["f.txt", 20],
      ["b", 1],
    ]);
    // a folder with entries inside stays a group
    expect(level.groups.map((g) => g.path)).toEqual(["a"]);
  });

  it("dentro una cartella aperta, le sue sottocartelle non lette sono celle", () => {
    const deep = [dir("a", "notCompared"), dir("a/s", "notCompared"), file("a/x.txt", 10, "notCompared")];
    const level = mapLevel(deep, "a", "all", "", undefined, true);
    expect(level.files.map((f) => f.entry.path).sort()).toEqual(["a/s", "a/x.txt"]);
    expect(level.groups).toEqual([]);
  });
});
