import { describe, expect, it } from "vitest";
import type { DirEntryDiff, EntryStatus } from "../types";
import { badgesOf, inset, layoutGroup, layoutLevel, nameOf, parentOf, radius, sortLeaves, stateClass } from "./mapLayout";
import type { MapGroup, MapLeaf, MapLevel } from "./treemap";

const entry = (path: string, status: EntryStatus = "different", extra: Partial<DirEntryDiff> = {}): DirEntryDiff => ({
  path,
  status,
  leftKind: "file",
  rightKind: "file",
  leftSize: 1,
  rightSize: 1,
  leftModified: null,
  rightModified: null,
  ...extra,
});
const leaf = (path: string, value: number, status: EntryStatus = "different"): MapLeaf => ({ entry: entry(path, status), value });
const group = (path: string, leaves: MapLeaf[]): MapGroup => ({
  path,
  name: nameOf(path),
  entry: undefined,
  leaves,
  value: leaves.reduce((a, l) => a + l.value, 0),
});

describe("mapLayout", () => {
  it("nome e cartella di un percorso", () => {
    expect(nameOf("a/b/c.txt")).toBe("c.txt");
    expect(nameOf("c.txt")).toBe("c.txt");
    expect(parentOf("a/b/c.txt")).toBe("a/b");
    expect(parentOf("c.txt")).toBe("");
  });

  it("il raggio non supera un quarto del lato minore", () => {
    expect(radius({ x: 0, y: 0, w: 100, h: 100 }, 6)).toBe(6);
    expect(radius({ x: 0, y: 0, w: 100, h: 8 }, 6)).toBe(2);
    expect(radius({ x: 0, y: 0, w: 3, h: 3 }, 6)).toBe(0);
  });

  it("la distanza tra le celle cresce con la cella e non fa sparire quelle piccole", () => {
    expect(inset({ x: 10, y: 20, w: 100, h: 80 }, 3)).toEqual({ x: 13, y: 23, w: 94, h: 74 });
    expect(inset({ x: 0, y: 0, w: 60, h: 60 }, 3)).toEqual({ x: 3, y: 3, w: 54, h: 54 });
    expect(inset({ x: 0, y: 0, w: 45, h: 90 }, 3)).toEqual({ x: 1, y: 1, w: 43, h: 88 }); // the smaller side counts
    expect(inset({ x: 0, y: 0, w: 53, h: 53 }, 2)).toEqual({ x: 2, y: 2, w: 49, h: 49 });
    // below 30 px no shrinking
    expect(inset({ x: 4, y: 4, w: 25, h: 200 }, 3)).toEqual({ x: 4, y: 4, w: 25, h: 200 });
    expect(inset({ x: 0, y: 0, w: 12, h: 12 }, 3)).toEqual({ x: 0, y: 0, w: 12, h: 12 });
  });

  it("le classi di stato: senza voce è «diverso», le differenze minori hanno la loro", () => {
    expect(stateClass(undefined)).toBe("different");
    expect(stateClass(entry("a", "leftOnly"))).toBe("leftOnly");
    expect(stateClass(entry("a", "different", { minor: { eol: true } as never }))).toBe("different minor");
  });

  it("il badge di una cartella conta ogni tipo a parte e ignora gli uguali", () => {
    const minor = { entry: entry("m", "different", { minor: { eol: true } as never }), value: 1 };
    const b = badgesOf([leaf("a", 1), leaf("b", 1, "leftOnly"), leaf("b2", 1, "leftOnly"), leaf("r", 1, "rightOnly"), leaf("t", 1, "typeMismatch"), minor, leaf("c", 1, "identical")]);
    expect(b).toEqual({ different: 1, minor: 1, leftOnly: 2, rightOnly: 1, typeMismatch: 1, notCompared: 0 });
    // not compared (the map of the preview) is counted apart
    expect(badgesOf([leaf("n", 1, "notCompared"), leaf("m", 1, "notCompared")]).notCompared).toBe(2);
    expect(badgesOf([leaf("x", 1, "identical")])).toEqual({ different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0, notCompared: 0 });
  });

  it("al livello mostrato i piccoli (almeno due) diventano una sola cella in fondo", () => {
    const level: MapLevel = { files: [leaf("big", 10_000), leaf("s1", 1), leaf("s2", 1)], groups: [] };
    const { placed, small } = layoutLevel(level, { w: 400, h: 300 });
    expect(small).toHaveLength(2);
    const clusters = placed.filter((p) => "cluster" in p.key);
    expect(clusters).toHaveLength(1);
    expect(placed.filter((p) => "file" in p.key)).toHaveLength(1);
  });

  it("un solo elemento piccolo resta com'è, e senza area non si raggruppa nulla", () => {
    const one: MapLevel = { files: [leaf("big", 10_000), leaf("s1", 1)], groups: [] };
    expect(layoutLevel(one, { w: 400, h: 300 }).small).toHaveLength(0);
    const two: MapLevel = { files: [leaf("big", 10_000), leaf("s1", 1), leaf("s2", 1)], groups: [] };
    expect(layoutLevel(two, { w: 0, h: 0 })).toEqual({ placed: [], small: [] });
  });

  it("dentro una cartella: «+N» solo se resta una cella leggibile", () => {
    const withBig = group("d", [leaf("d/big", 10_000), leaf("d/a", 1), leaf("d/b", 1)]);
    const cells = layoutGroup(withBig, 300, 200);
    expect(cells.some((c) => "more" in c.key)).toBe(true);
    expect(cells.filter((c) => "leaf" in c.key)).toHaveLength(1);
    // many equal files in a small folder: none is readable, all are drawn
    const many = group("e", Array.from({ length: 50 }, (_, i) => leaf(`e/f${i}`, 10)));
    const all = layoutGroup(many, 60, 60);
    expect(all.some((c) => "more" in c.key)).toBe(false);
    expect(all.filter((c) => "leaf" in c.key)).toHaveLength(50);
  });

  it("una cartella troppo stretta non ha celle", () => {
    expect(layoutGroup(group("d", [leaf("d/a", 1)]), 10, 100)).toEqual([]);
    expect(layoutGroup(group("d", [leaf("d/a", 1)]), 100, 20)).toEqual([]);
  });

  it("l'elenco della cartella si ordina per nome (senza maiuscole, numeri come numeri) o per dimensione", () => {
    const ls = [leaf("d/b10", 5), leaf("d/B2", 5), leaf("d/a", 9), leaf("d/c", 1)];
    const names = (x: ReturnType<typeof sortLeaves>) => x.map((l) => l.entry.path);
    expect(names(sortLeaves(ls, "d", { by: "name", dir: "asc" }))).toEqual(["d/a", "d/B2", "d/b10", "d/c"]);
    expect(names(sortLeaves(ls, "d", { by: "name", dir: "desc" }))).toEqual(["d/c", "d/b10", "d/B2", "d/a"]);
    // equal sizes: by name
    expect(names(sortLeaves(ls, "d", { by: "size", dir: "desc" }))).toEqual(["d/a", "d/B2", "d/b10", "d/c"]);
    expect(names(sortLeaves(ls, "d", { by: "size", dir: "asc" }))[0]).toBe("d/c");
    expect(names(sortLeaves(ls, "d", { by: "size", dir: "asc" }))).toEqual(["d/c", "d/B2", "d/b10", "d/a"]);
    expect(names(ls)).toEqual(["d/b10", "d/B2", "d/a", "d/c"]); // the input is untouched
  });
});
