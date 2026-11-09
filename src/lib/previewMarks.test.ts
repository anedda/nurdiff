import { describe, expect, it } from "vitest";
import type { DirEntryDiff, DirStats, EntryKind, EntryStatus, MinorCauses } from "../types";
import { anyBusy, marksAfterCompare, statsAfterCompare, swapStats } from "./previewMarks";
import type { PreviewMark } from "./previewPick";

const eol: MinorCauses = { eol: true, encoding: false, trailingSpace: false, whitespace: false, case: false };
const entry = (path: string, status: EntryStatus, l: EntryKind | null = "file", r: EntryKind | null = "file", minor?: MinorCauses): DirEntryDiff => ({
  path,
  status,
  leftKind: l,
  rightKind: r,
  leftSize: null,
  rightSize: null,
  leftModified: null,
  rightModified: null,
  ...(minor ? { minor } : {}),
});

describe("marksAfterCompare", () => {
  it("segna uguale o diverso, con le cause se la differenza è minore", () => {
    const m = marksAfterCompare(new Map(), "a.txt", [entry("a.txt", "different", "file", "file", eol)]);
    expect(m.get("a.txt")).toEqual({ status: "different", minor: eol });
    expect(marksAfterCompare(new Map(), "b.txt", [entry("b.txt", "identical")]).get("b.txt")).toEqual({ status: "identical" });
  });
  it("sostituisce i segni vecchi della riga e dei suoi discendenti, e lascia gli altri", () => {
    const old = new Map<string, PreviewMark>([
      ["d", { status: "identical" }],
      ["d/x", { status: "identical" }],
      ["d/y", "busy"],
      ["dd", { status: "identical" }],
      ["z", { status: "different" }],
    ]);
    const m = marksAfterCompare(old, "d", [entry("d", "different", "dir", "dir"), entry("d/x", "different")]);
    expect([...m.keys()].sort()).toEqual(["d", "d/x", "dd", "z"]);
    expect(m.get("d/x")).toEqual({ status: "different" });
    expect(m.get("dd")).toEqual({ status: "identical" });
  });
  it("le voci presenti da un lato solo non hanno segno", () => {
    const m = marksAfterCompare(new Map(), "d", [entry("d", "different", "dir", "dir"), entry("d/solo", "leftOnly", "file", null)]);
    expect([...m.keys()]).toEqual(["d"]);
  });
  it("una voce illeggibile ha il segno «!» con il motivo, anche se è da un lato solo", () => {
    const bad = { ...entry("d/x", "different"), error: "Permission denied" };
    const lone = { ...entry("d/solo", "leftOnly", "dir", null), error: "Permission denied" };
    const m = marksAfterCompare(new Map(), "d", [entry("d", "different", "dir", "dir"), bad, lone], (r) => `illeggibile: ${r}`);
    expect(m.get("d/x")).toEqual({ error: "illeggibile: Permission denied", unreadable: true });
    expect(m.get("d/solo")).toEqual({ error: "illeggibile: Permission denied" });
  });
  it("non modifica la mappa di partenza", () => {
    const old = new Map<string, PreviewMark>([["a", "busy"]]);
    marksAfterCompare(old, "a", [entry("a", "identical")]);
    expect(old.get("a")).toBe("busy");
  });
});

describe("statsAfterCompare", () => {
  it("per una cartella dà il riepilogo, per un file lo toglie", () => {
    const withDir = statsAfterCompare(new Map(), "d", [entry("d", "different", "dir", "dir"), entry("d/a", "different"), entry("d/b", "identical")]);
    expect(withDir.get("d")).toMatchObject({ different: 1, identical: 1 });
    const old = new Map<string, DirStats>([["f", { identical: 1, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0 }]]);
    expect(statsAfterCompare(old, "f", [entry("f", "identical")]).has("f")).toBe(false);
  });
  it("dà un riepilogo anche a ogni cartella contenuta, e toglie quelli vecchi del sottoalbero", () => {
    const old = new Map<string, DirStats>([["d/old", { identical: 9, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0 }], ["z", { identical: 1, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0 }]]);
    const s = statsAfterCompare(old, "d", [
      entry("d", "different", "dir", "dir"),
      entry("d/sub", "different", "dir", "dir"),
      entry("d/sub/a", "different"),
      entry("d/b", "identical"),
    ]);
    expect([...s.keys()].sort()).toEqual(["d", "d/sub", "z"]);
    expect(s.get("d")).toMatchObject({ different: 1, identical: 1 });
    expect(s.get("d/sub")).toMatchObject({ different: 1, identical: 0 });
  });
  it("dopo uno scambio inverte solo i riepiloghi nuovi", () => {
    const old = new Map<string, DirStats>([["x", { identical: 0, different: 0, minor: 0, leftOnly: 1, rightOnly: 0, typeMismatch: 0 }]]);
    const s = statsAfterCompare(old, "d", [entry("d", "different", "dir", "dir"), entry("d/s", "leftOnly", "file", null)], true);
    expect(s.get("x")).toMatchObject({ leftOnly: 1, rightOnly: 0 });
    expect(s.get("d")).toMatchObject({ leftOnly: 0, rightOnly: 1 });
  });
});

describe("swapStats", () => {
  it("inverte solo a sinistra e solo a destra", () => {
    const s = new Map<string, DirStats>([["d", { identical: 1, different: 2, minor: 1, leftOnly: 3, rightOnly: 4, typeMismatch: 5 }]]);
    expect(swapStats(s).get("d")).toEqual({ identical: 1, different: 2, minor: 1, leftOnly: 4, rightOnly: 3, typeMismatch: 5 });
  });
});

describe("anyBusy", () => {
  it("vero se almeno una riga è in corso", () => {
    expect(anyBusy(new Map<string, PreviewMark>())).toBe(false);
    expect(anyBusy(new Map<string, PreviewMark>([["a", { status: "identical" }], ["b", { error: "x" }]]))).toBe(false);
    expect(anyBusy(new Map<string, PreviewMark>([["a", { status: "identical" }], ["b", "busy"]]))).toBe(true);
  });
});
