import { describe, expect, it } from "vitest";
import type { DirListing } from "../types";
import { previewMapEntries } from "./previewMap";
import type { PreviewMark } from "./previewPick";
import { key, type PreviewRow } from "./previewTree";

const item = (name: string, kind: DirListing["kind"], size = 0, modified: number | null = 1): DirListing => ({ name, kind, size, modified });
const row = (rel: string, left: DirListing | null, right: DirListing | null): PreviewRow => ({
  rel,
  depth: 0,
  pair: { name: rel.slice(rel.lastIndexOf("/") + 1), left, right },
  isDir: left?.kind === "dir" || right?.kind === "dir",
  expanded: false,
  loading: false,
  failed: false,
});

describe("previewMapEntries", () => {
  it("quello che si sa dagli elenchi tiene il suo stato; il resto è «non confrontato»", () => {
    const out = previewMapEntries(
      [
        row("a.txt", item("a.txt", "file", 10), item("a.txt", "file", 12)),
        row("solo-sx", item("solo-sx", "file", 3), null),
        row("solo-dx", null, item("solo-dx", "dir")),
        row("tipo", item("tipo", "file", 1), item("tipo", "dir")),
        row("d", item("d", "dir"), item("d", "dir")),
      ],
      {},
    );
    expect(out.map((e) => [e.path, e.status])).toEqual([
      ["a.txt", "notCompared"],
      ["solo-sx", "leftOnly"],
      ["solo-dx", "rightOnly"],
      ["tipo", "typeMismatch"],
      ["d", "notCompared"],
    ]);
    expect(out[0]).toMatchObject({ leftKind: "file", rightKind: "file", leftSize: 10, rightSize: 12 });
    expect(out[1]).toMatchObject({ leftKind: "file", rightKind: null, rightSize: null });
  });

  it("la dimensione di una cartella è quella calcolata, e null finché non c'è", () => {
    const rows = [row("d", item("d", "dir"), item("d", "dir")), row("e", item("e", "dir"), null)];
    const none = previewMapEntries(rows, {});
    expect(none[0]).toMatchObject({ leftSize: null, rightSize: null });
    const some = previewMapEntries(rows, { [key("left", "d")]: 700, [key("right", "d")]: "loading", [key("left", "e")]: "error" });
    expect(some[0]).toMatchObject({ leftSize: 700, rightSize: null });
    expect(some[1]).toMatchObject({ leftSize: null });
  });

  it("una voce confrontata sul posto prende lo stato dal suo segno; in corso, fallita o senza segno resta «non confrontata»", () => {
    const rows = ["uguale", "diverso", "minore", "illeggibile", "fallito", "inCorso", "nessuno"].map((n) => row(n, item(n, "file"), item(n, "file")));
    const eol = { eol: true, encoding: false, trailingSpace: false, whitespace: false, case: false };
    const marks = new Map<string, PreviewMark>([
      ["uguale", { status: "identical" }],
      ["diverso", { status: "different" }],
      ["minore", { status: "different", minor: eol }],
      ["illeggibile", { error: "x", unreadable: true }],
      ["fallito", { error: "x" }],
      ["inCorso", "busy"],
    ]);
    const out = previewMapEntries(rows, {}, marks);
    expect(out.map((e) => [e.path, e.status])).toEqual([
      ["uguale", "identical"],
      ["diverso", "different"],
      ["minore", "different"],
      ["illeggibile", "different"],
      ["fallito", "notCompared"],
      ["inCorso", "notCompared"],
      ["nessuno", "notCompared"],
    ]);
    expect(out[2].minor).toEqual(eol);
    expect(out[1].minor).toBeUndefined();
  });

  it("anche una cartella confrontata sul posto; le voci di un lato solo e di tipo diverso tengono lo stato dagli elenchi", () => {
    const rows = [row("d", item("d", "dir"), item("d", "dir")), row("solo", item("solo", "file"), null), row("t", item("t", "file"), item("t", "dir"))];
    const marks = new Map<string, PreviewMark>([["d", { status: "identical" }], ["solo", { status: "identical" }], ["t", { status: "identical" }]]);
    expect(previewMapEntries(rows, {}, marks).map((e) => e.status)).toEqual(["identical", "leftOnly", "typeMismatch"]);
  });

  it("porta le date dei due lati", () => {
    const [e] = previewMapEntries([row("a", item("a", "file", 1, 111), item("a", "file", 1, null))], {});
    expect([e.leftModified, e.rightModified]).toEqual([111, null]);
  });
});
