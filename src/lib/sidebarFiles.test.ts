import { describe, expect, it } from "vitest";
import type { DirEntryDiff, EntryStatus } from "../types";
import { allFolders, comparable, comparableRows, relativeTo } from "./sidebarFiles";
import { visibleRows } from "./tree";

const entry = (
  path: string,
  status: EntryStatus = "different",
  leftKind: DirEntryDiff["leftKind"] = "file",
  rightKind: DirEntryDiff["rightKind"] = "file",
): DirEntryDiff => ({
  path,
  status,
  leftKind,
  rightKind,
  leftSize: 1,
  rightSize: 1,
  leftModified: null,
  rightModified: null,
});

const entries = [
  entry("src", "different", "dir", "dir"),
  entry("src/a.rs"),
  entry("src/b.rs", "rightOnly", null, "file"),
  entry("src/c.rs"),
  entry("z.txt", "identical"),
];

describe("sidebarFiles", () => {
  it("si confrontano solo i file presenti da entrambi i lati", () => {
    expect(comparable(entry("a"))).toBe(true);
    expect(comparable(entry("a", "rightOnly", null, "file"))).toBe(false);
    expect(comparable(entry("a", "different", "dir", "dir"))).toBe(false);
  });

  it("l'elenco dei file confrontabili salta quelli che non lo sono", () => {
    const rows = visibleRows(entries, new Set(["src"]), "diffs", "");
    expect(comparableRows(rows).map((r) => r.entry.path)).toEqual(["src/a.rs", "src/c.rs"]);
  });

  it("percorso relativo a una radice", () => {
    expect(relativeTo("/a/b", "/a/b/src/x.rs")).toBe("src/x.rs");
    expect(relativeTo("/a/b/", "/a/b/x.rs")).toBe("x.rs");
    expect(relativeTo("C:\\a\\b", "C:\\a\\b\\src\\x.rs")).toBe("src/x.rs");
    expect(relativeTo("/a/b", "/a/bc/x.rs")).toBeNull();
    expect(relativeTo("/a/b", "/altro/x.rs")).toBeNull();
  });
});

describe("allFolders", () => {
  it("tutte le cartelle, anche quelle presenti da un lato solo o identiche, e nessun file", () => {
    const list = [
      entry("src", "different", "dir", "dir"),
      entry("src/a.rs"),
      entry("src/sub", "identical", "dir", "dir"),
      entry("solo", "leftOnly", "dir", null),
      entry("solo/x.txt", "leftOnly", "file", null),
      entry("tipo", "typeMismatch", "file", "dir"),
    ];
    expect([...allFolders(list)].sort()).toEqual(["solo", "src", "src/sub", "tipo"]);
  });
  it("senza cartelle, nessuna", () => {
    expect(allFolders([entry("a.txt")]).size).toBe(0);
    expect(allFolders([]).size).toBe(0);
  });
});
