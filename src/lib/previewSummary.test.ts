import { describe, expect, it } from "vitest";
import type { DirListing, DirScan, DirStats } from "../types";
import type { PreviewMark } from "./previewPick";
import { previewStats, scanStats } from "./previewSummary";
import type { PreviewRow } from "./previewTree";

const item = (name: string, kind: "file" | "dir"): DirListing => ({ name, kind, size: 0, modified: null });
const row = (rel: string, left: DirListing | null, right: DirListing | null, expanded = false): PreviewRow => ({
  rel,
  depth: 0,
  pair: { name: rel, left, right },
  isDir: left?.kind === "dir" || right?.kind === "dir",
  expanded,
  loading: false,
  failed: false,
});
const f = (n: string) => item(n, "file");
const d = (n: string) => item(n, "dir");
const stats = (s: Partial<DirStats>): DirStats => ({ identical: 0, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0, ...s });

describe("previewStats", () => {
  it("senza confrontare nulla: orfani e tipi diversi si vedono, le coppie di file sono «non confrontate»", () => {
    const rows = [row("a", f("a"), f("a")), row("b", f("b"), null), row("c", null, f("c")), row("t", f("t"), d("t")), row("d", d("d"), d("d"))];
    expect(previewStats(rows, new Map(), new Map())).toEqual({ identical: 0, different: 0, minor: 0, leftOnly: 1, rightOnly: 1, typeMismatch: 1, notCompared: 1 });
  });
  it("una coppia confrontata conta come uguale o diversa (con la quota delle minori)", () => {
    const marks = new Map<string, PreviewMark>([
      ["a", { status: "identical" }],
      ["b", { status: "different" }],
      ["c", { status: "different", minor: { eol: true, encoding: false, trailingSpace: false, whitespace: false, case: false } }],
    ]);
    const rows = [row("a", f("a"), f("a")), row("b", f("b"), f("b")), row("c", f("c"), f("c")), row("e", f("e"), f("e"))];
    expect(previewStats(rows, marks, new Map())).toMatchObject({ identical: 1, different: 2, minor: 1, notCompared: 1 });
  });
  it("un confronto in corso o fallito è ancora «non confrontato»", () => {
    const marks = new Map<string, PreviewMark>([["a", "busy"], ["b", { error: "x" }]]);
    const rows = [row("a", f("a"), f("a")), row("b", f("b"), f("b"))];
    expect(previewStats(rows, marks, new Map()).notCompared).toBe(2);
  });
  it("una cartella chiusa già confrontata somma il suo riepilogo; aperta no (si contano le sue righe)", () => {
    const summaries = new Map([["d", stats({ identical: 4, different: 2, leftOnly: 1 })]]);
    const closed = [row("d", d("d"), d("d"), false)];
    expect(previewStats(closed, new Map(), summaries)).toMatchObject({ identical: 4, different: 2, leftOnly: 1, notCompared: 0 });
    const open = [row("d", d("d"), d("d"), true), row("d/x", f("x"), f("x"))];
    expect(previewStats(open, new Map(), summaries)).toMatchObject({ identical: 0, different: 0, leftOnly: 0, notCompared: 1 });
  });
  it("senza righe è tutto zero", () => {
    expect(previewStats([], new Map(), new Map())).toEqual({ identical: 0, different: 0, minor: 0, leftOnly: 0, rightOnly: 0, typeMismatch: 0, notCompared: 0 });
  });
});

describe("scanStats", () => {
  const scan = (s: Partial<DirScan>): DirScan => ({ leftOnly: 0, rightOnly: 0, typeMismatch: 0, filePairs: 0, visited: 0, truncated: false, ...s });
  it("orfani e tipi diversi vengono dalla scansione, le coppie senza segno sono «non confrontate»", () => {
    expect(scanStats(scan({ leftOnly: 3, rightOnly: 4, typeMismatch: 1, filePairs: 10 }), new Map(), new Map())).toEqual({
      identical: 0, different: 0, minor: 0, leftOnly: 3, rightOnly: 4, typeMismatch: 1, notCompared: 10,
    });
  });
  it("le coppie confrontate sul posto sono uguali o diverse e non più «non confrontate»", () => {
    const marks = new Map<string, PreviewMark>([["a", { status: "identical" }], ["b", { status: "different" }], ["c", "busy"], ["d", { error: "x" }]]);
    expect(scanStats(scan({ filePairs: 10 }), marks, new Map())).toMatchObject({ identical: 1, different: 1, notCompared: 8 });
  });
  it("i segni delle cartelle (hanno un riepilogo) non contano come file", () => {
    const marks = new Map<string, PreviewMark>([["d", { status: "different" }], ["d/x", { status: "identical" }]]);
    const summaries = new Map([["d", stats({ identical: 1 })]]);
    expect(scanStats(scan({ filePairs: 3 }), marks, summaries)).toMatchObject({ identical: 1, different: 0, notCompared: 2 });
  });
  it("una voce dei due lati che il core non ha potuto leggere è diversa; una cartella non era tra le coppie", () => {
    const marks = new Map<string, PreviewMark>([
      ["chiusa", { error: "x", unreadable: true }],
      ["f.txt", { error: "x", unreadable: true }],
      ["fallito.txt", { error: "x" }],
    ]);
    const summaries = new Map([["chiusa", stats({ different: 1 })]]);
    expect(scanStats(scan({ filePairs: 3 }), marks, summaries)).toMatchObject({ different: 2, notCompared: 2 });
    const rows = [row("f.txt", f("f.txt"), f("f.txt")), row("chiusa", d("chiusa"), d("chiusa"))];
    expect(previewStats(rows, marks, summaries)).toMatchObject({ different: 2, notCompared: 0 });
  });
  it("con scansione parziale «non confrontati» non va sotto zero", () => {
    const marks = new Map<string, PreviewMark>([["a", { status: "identical" }], ["b", { status: "identical" }]]);
    expect(scanStats(scan({ filePairs: 1, truncated: true }), marks, new Map()).notCompared).toBe(0);
  });
});
