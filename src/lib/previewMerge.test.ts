import { describe, expect, it } from "vitest";
import type { DirListing, EntryKind } from "../types";
import { mergeListings } from "./previewMerge";

const e = (name: string, kind: EntryKind = "file"): DirListing => ({ name, kind, size: 1, modified: null });
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("mergeListings", () => {
  it("una riga per nome, con i due lati affiancati", () => {
    const rows = mergeListings([e("a.txt"), e("b.txt")], [e("b.txt"), e("c.txt")]);
    expect(names(rows)).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(rows[0]).toMatchObject({ left: expect.anything(), right: null });
    expect(rows[1].left && rows[1].right).toBeTruthy();
    expect(rows[2]).toMatchObject({ left: null, right: expect.anything() });
  });

  it("le cartelle vengono prima dei file, in ordine alfabetico senza badare alle maiuscole", () => {
    const rows = mergeListings([e("Zeta"), e("beta", "dir"), e("alfa.txt")], [e("Alfa", "dir"), e("zeta2")]);
    expect(names(rows)).toEqual(["Alfa", "beta", "alfa.txt", "Zeta", "zeta2"]);
  });

  it("un nome che è file da un lato e cartella dall'altro conta come cartella", () => {
    const rows = mergeListings([e("x")], [e("x", "dir"), e("a")]);
    expect(names(rows)).toEqual(["x", "a"]);
  });

  it("un lato non letto conta come vuoto", () => {
    expect(names(mergeListings(null, [e("a")]))).toEqual(["a"]);
    expect(mergeListings(null, null)).toEqual([]);
  });

  it("nomi che differiscono solo per le maiuscole restano due righe", () => {
    const rows = mergeListings([e("Foto")], [e("foto")]);
    expect(rows).toHaveLength(2);
  });
});
