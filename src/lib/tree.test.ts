import { describe, expect, it } from "vitest";
import type { DirEntryDiff, EntryKind, EntryStatus, MinorCauses } from "../types";
import { applyEntries, emptiedByFilter, statsOf, defaultExpanded, dirTotals, diffMark, isMinor, joinPath, matchesFilter, newerSide, statusClass, statusKind, visibleRows } from "./tree";

function e(
  path: string,
  status: EntryStatus,
  kind: EntryKind = "file",
  extra: Partial<DirEntryDiff> = {},
): DirEntryDiff {
  return {
    path,
    status,
    leftKind: status === "rightOnly" ? null : kind,
    rightKind: status === "leftOnly" ? null : kind,
    leftSize: null,
    rightSize: null,
    leftModified: null,
    rightModified: null,
    ...extra,
  };
}

const NO_CAUSES: MinorCauses = { eol: false, encoding: false, trailingSpace: false, whitespace: false, case: false };
const EOL_ONLY: MinorCauses = { ...NO_CAUSES, eol: true };

const entries = [
  e("a", "different", "dir"),
  e("a/x.txt", "different"),
  e("a/y.txt", "identical"),
  e("b", "identical", "dir"),
  e("b/z.txt", "identical"),
  e("c.txt", "leftOnly"),
];
const paths = (rows: { entry: DirEntryDiff }[]) => rows.map((r) => r.entry.path);

describe("defaultExpanded", () => {
  it("apre le cartelle con differenze e chiude quelle uguali", () => {
    expect([...defaultExpanded(entries)]).toEqual(["a"]);
  });
});

describe("visibleRows", () => {
  it("le cartelle chiuse nascondono i figli", () => {
    expect(paths(visibleRows(entries, new Set(), "all", ""))).toEqual(["a", "b", "c.txt"]);
    expect(paths(visibleRows(entries, new Set(["a"]), "all", ""))).toEqual([
      "a", "a/x.txt", "a/y.txt", "b", "c.txt",
    ]);
  });

  it("profondità, nome e stato aperto", () => {
    const rows = visibleRows(entries, new Set(["a"]), "all", "");
    expect(rows[1]).toMatchObject({ name: "x.txt", depth: 1, isDir: false, expanded: false });
    expect(rows[0]).toMatchObject({ name: "a", depth: 0, isDir: true, expanded: true });
  });

  it("solo differenze: restano anche le cartelle con differenze, non le uguali", () => {
    const all = new Set(["a", "b"]);
    expect(paths(visibleRows(entries, all, "diffs", ""))).toEqual(["a", "a/x.txt", "c.txt"]);
  });

  it("solo uguali: la cartella con differenze resta come contenitore", () => {
    const all = new Set(["a", "b"]);
    expect(paths(visibleRows(entries, all, "same", ""))).toEqual([
      "a", "a/y.txt", "b", "b/z.txt",
    ]);
  });

  it("il testo cerca nei nomi, senza badare alle maiuscole, e tiene le cartelle contenitore", () => {
    const all = new Set(["a", "b"]);
    expect(paths(visibleRows(entries, all, "all", "Z.TXT"))).toEqual(["b", "b/z.txt"]);
    expect(paths(visibleRows(entries, all, "all", "nulla"))).toEqual([]);
  });

  it("cartelle annidate: una chiusa nasconde tutti i discendenti ma non i fratelli", () => {
    const deep = [
      e("a", "different", "dir"),
      e("a/b", "different", "dir"),
      e("a/b/f", "different"),
      e("a/g", "different"),
    ];
    expect(paths(visibleRows(deep, new Set(["a"]), "all", ""))).toEqual(["a", "a/b", "a/g"]);
    expect(paths(visibleRows(deep, new Set(["a", "a/b"]), "all", ""))).toEqual([
      "a", "a/b", "a/b/f", "a/g",
    ]);
  });

  it("una cartella con lo stesso prefisso nel nome non viene scambiata per figlia", () => {
    const list = [e("a", "different", "dir"), e("a/f", "different"), e("a-b", "different")];
    expect(paths(visibleRows(list, new Set(), "all", ""))).toEqual(["a", "a-b"]);
  });
});

describe("filtro Minor", () => {
  const all = new Set(["a", "b"]);
  it("Minor: solo i file diversi per cose minori, con la cartella che li contiene", () => {
    // a/x.txt really is different: no minor file
    expect(paths(visibleRows(entries, all, "minor", ""))).toEqual([]);
    const withMinor = [...entries, e("m.txt", "different", "file", { minor: EOL_ONLY })];
    expect(paths(visibleRows(withMinor, all, "minor", ""))).toEqual(["m.txt"]);
    // and differences remain: "Diffs" includes them
    expect(matchesFilter(withMinor[withMinor.length - 1], "diffs")).toBe(true);
  });
  it("isMinor: solo i file diversi con le cause; mai le cartelle né i file davvero diversi", () => {
    expect(isMinor(e("m.txt", "different", "file", { minor: EOL_ONLY }))).toBe(true);
    expect(isMinor(e("x.txt", "different"))).toBe(false);
    expect(isMinor(e("d", "different", "dir", { minor: EOL_ONLY }))).toBe(false);
    expect(isMinor(e("i.txt", "identical"))).toBe(false);
  });
});

describe("statsOf con le differenze minori", () => {
  it("conta i minori come sottoinsieme dei diversi", () => {
    const s = statsOf([
      e("a.txt", "different"),
      e("m.txt", "different", "file", { minor: EOL_ONLY }),
      e("n.txt", "different", "file", { minor: { ...NO_CAUSES, case: true } }),
      e("i.txt", "identical"),
    ]);
    expect(s).toEqual({ identical: 1, different: 3, minor: 2, leftOnly: 0, rightOnly: 0, typeMismatch: 0 });
  });

  it("una cartella dei due lati conta solo se non si è potuta leggere", () => {
    const s = statsOf([e("d", "different", "dir"), e("d/x.txt", "different"), e("chiusa", "different", "dir", { error: "denied" })]);
    expect(s.different).toBe(2);
  });
});

describe("diffMark", () => {
  it("segna con ≠ file diversi, cartelle con differenze e voci di tipo diverso", () => {
    expect(diffMark(e("a.txt", "different"))).toBe("≠");
    expect(diffMark(e("a", "different", "dir"))).toBe("≠");
    expect(diffMark(e("a", "typeMismatch"))).toBe("≠");
  });

  it("segna con ≈ i file diversi solo per cose minori", () => {
    expect(diffMark(e("m.txt", "different", "file", { minor: EOL_ONLY }))).toBe("≈");
  });

  it("segna con = le voci identiche, file e cartelle", () => {
    expect(diffMark(e("a.txt", "identical"))).toBe("=");
    expect(diffMark(e("b", "identical", "dir"))).toBe("=");
  });

  it("non segna le voci presenti da un lato solo", () => {
    expect(diffMark(e("a.txt", "leftOnly"))).toBe("");
    expect(diffMark(e("a.txt", "rightOnly"))).toBe("");
  });
});

describe("newerSide", () => {
  const f = (l: number | null, r: number | null, status: EntryStatus = "different") =>
    e("f", status, "file", { leftModified: l, rightModified: r });
  it("indica il lato più recente solo per file diversi con date diverse", () => {
    expect(newerSide(f(2, 1))).toBe("left");
    expect(newerSide(f(1, 2))).toBe("right");
    expect(newerSide(f(1, 1))).toBeNull();
    expect(newerSide(f(null, 1))).toBeNull();
    expect(newerSide(f(2, 1, "identical"))).toBeNull();
  });
});

describe("joinPath", () => {
  it("usa il separatore della radice", () => {
    expect(joinPath("/home/u/a", "sub/f.txt")).toBe("/home/u/a/sub/f.txt");
    expect(joinPath("/home/u/a/", "f.txt")).toBe("/home/u/a/f.txt");
    expect(joinPath("C:\\dati\\a", "sub/f.txt")).toBe("C:\\dati\\a\\sub\\f.txt");
  });
});

describe("dirTotals", () => {
  const f = (path: string, l: number | null, r: number | null, status: EntryStatus = "different") =>
    e(path, status, "file", { leftSize: l, rightSize: r });
  it("somma i file di ogni cartella antenata, un lato alla volta", () => {
    const list = [
      e("a", "different", "dir"),
      f("a/x.txt", 10, 12),
      e("a/b", "different", "dir"),
      f("a/b/y.txt", 5, 7),
      f("c.txt", 1, 1),
    ];
    const t = dirTotals(list);
    expect(t.get("a")).toEqual({ left: 15, right: 19 });
    expect(t.get("a/b")).toEqual({ left: 5, right: 7 });
    expect(t.has("c.txt")).toBe(false);
  });
  it("una cartella presente da un lato solo ha il totale solo di quel lato; vuota fa zero", () => {
    const list = [
      e("solo", "leftOnly", "dir"),
      f("solo/z.txt", 4, null, "leftOnly"),
      e("vuota", "identical", "dir"),
    ];
    const t = dirTotals(list);
    expect(t.get("solo")).toEqual({ left: 4, right: null });
    expect(t.get("vuota")).toEqual({ left: 0, right: 0 });
  });
});

describe("filtri sugli orfani e sulle date", () => {
  const L = e("l.txt", "leftOnly");
  const R = e("r.txt", "rightOnly");
  const T = e("t", "typeMismatch");
  const I = e("i.txt", "identical");
  const DL = e("dl.txt", "different", "file", { leftModified: 9, rightModified: 1 });
  const DR = e("dr.txt", "different", "file", { leftModified: 1, rightModified: 9 });
  const D0 = e("d0.txt", "different");
  const names = (f: Parameters<typeof matchesFilter>[1]) =>
    [L, R, T, I, DL, DR, D0].filter((x) => matchesFilter(x, f)).map((x) => x.path);

  it("orfani: solo le voci presenti da un lato; il tipo diverso no", () => {
    expect(names("orphans")).toEqual(["l.txt", "r.txt"]);
    expect(names("leftOrphans")).toEqual(["l.txt"]);
    expect(names("rightOrphans")).toEqual(["r.txt"]);
  });
  it("senza orfani, con e senza le uguali", () => {
    expect(names("noOrphans")).toEqual(["t", "i.txt", "dl.txt", "dr.txt", "d0.txt"]);
    expect(names("diffsNoOrphans")).toEqual(["t", "dl.txt", "dr.txt", "d0.txt"]);
  });
  it("più recente da un lato", () => {
    expect(names("leftNewer")).toEqual(["dl.txt"]);
    expect(names("rightNewer")).toEqual(["dr.txt"]);
  });
  it("gli orfani dentro una cartella mostrano anche la cartella", () => {
    const list = [e("d", "different", "dir"), e("d/o.txt", "leftOnly"), e("d/s.txt", "identical")];
    const rows = visibleRows(list, new Set(["d"]), "orphans", "");
    expect(rows.map((r) => r.entry.path)).toEqual(["d", "d/o.txt"]);
  });
});

describe("applyEntries", () => {
  const base = {
    entries: [
      e("a", "different", "dir"),
      e("a/x.txt", "different"),
      e("a/y.txt", "identical"),
      e("b.txt", "identical"),
    ],
    stats: statsOf([]),
  };
  const diff = { ...base, stats: statsOf(base.entries) };

  it("una voce diversa che diventa uguale aggiorna la cartella e le statistiche", () => {
    const r = applyEntries(diff, "a/x.txt", [e("a/x.txt", "identical")]);
    expect(r.entries.map((x) => [x.path, x.status])).toEqual([
      ["a", "identical"],
      ["a/x.txt", "identical"],
      ["a/y.txt", "identical"],
      ["b.txt", "identical"],
    ]);
    expect(r.stats).toEqual({ identical: 3, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0 });
    expect(diff.entries[0].status).toBe("different"); // the original does not change
  });

  it("una voce uguale che diventa diversa rende diverse le cartelle antenate", () => {
    const deep = {
      entries: [e("d", "identical", "dir"), e("d/s", "identical", "dir"), e("d/s/f", "identical")],
      stats: statsOf([]),
    };
    const r = applyEntries(deep, "d/s/f", [e("d/s/f", "different")]);
    expect(r.entries.map((x) => x.status)).toEqual(["different", "different", "different"]);
    expect(r.stats.different).toBe(1);
  });

  it("una cartella riconfrontata sostituisce i suoi figli", () => {
    const r = applyEntries(diff, "a", [e("a", "identical", "dir"), e("a/z.txt", "identical")]);
    expect(r.entries.map((x) => x.path)).toEqual(["a", "a/z.txt", "b.txt"]);
  });

  it("una voce scomparsa da entrambi i lati si toglie; una nuova va al suo posto", () => {
    expect(applyEntries(diff, "a/x.txt", []).entries.map((x) => x.path)).toEqual(["a", "a/y.txt", "b.txt"]);
    const r = applyEntries(diff, "a/w.txt", [e("a/w.txt", "leftOnly")]);
    expect(r.entries.map((x) => x.path)).toEqual(["a", "a/w.txt", "a/x.txt", "a/y.txt", "b.txt"]);
    const r2 = applyEntries(diff, "a/z.txt", [e("a/z.txt", "rightOnly")]);
    expect(r2.entries.map((x) => x.path)).toEqual(["a", "a/x.txt", "a/y.txt", "a/z.txt", "b.txt"]);
  });
});

describe("visibleRows con voci da tenere", () => {
  it("una voce esclusa dal filtro resta se è tra quelle da tenere", () => {
    const list = [e("a.txt", "identical"), e("b.txt", "different")];
    expect(visibleRows(list, new Set(), "diffs", "").map((r) => r.entry.path)).toEqual(["b.txt"]);
    expect(visibleRows(list, new Set(), "diffs", "", new Set(["a.txt"])).map((r) => r.entry.path)).toEqual(["a.txt", "b.txt"]);
  });

  it("stato mostrato e classi CSS: le differenze minori hanno il loro", () => {
    const minor = e("m.txt", "different", "file", { minor: EOL_ONLY });
    expect(statusKind(minor)).toBe("minor");
    expect(statusClass(minor)).toBe("different minor");
    expect(statusKind(e("a.txt", "different"))).toBe("different");
    expect(statusClass(e("a.txt", "different"))).toBe("different");
    expect(statusKind(e("d", "different", "dir", { minor: EOL_ONLY }))).toBe("different");
    expect(statusClass(e("b.txt", "leftOnly"))).toBe("leftOnly");
    expect(statusKind(e("c.txt", "identical"))).toBe("identical");
  });
});

describe("emptiedByFilter", () => {
  it("solo con il filtro attivo, una cartella da sola, leggibile", () => {
    const d = e("d", "identical", "dir");
    expect(emptiedByFilter([d], true)).toBe(true);
    expect(emptiedByFilter([d], false)).toBe(false);
    expect(emptiedByFilter([d, e("d/a.rs", "identical")], true)).toBe(false);
    expect(emptiedByFilter([e("d", "different", "dir", { error: "denied" })], true)).toBe(false);
    expect(emptiedByFilter([e("f.rs", "identical")], true)).toBe(false);
  });
});
