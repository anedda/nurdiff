import { describe, expect, it } from "vitest";
import { addRecent, parseRecents, removeRecent, type Recent } from "./recents";

const r = (left: string, at = 1, mode: Recent["mode"] = "files", right = "/b"): Recent => ({
  mode,
  left,
  right,
  at,
});

describe("addRecent", () => {
  it("mette il più recente in testa", () => {
    expect(addRecent([r("/a", 1)], r("/c", 2)).map((x) => x.left)).toEqual(["/c", "/a"]);
  });
  it("lo stesso confronto non compare due volte: risale in testa con la nuova data", () => {
    const list = addRecent([r("/a", 1), r("/c", 2)], r("/a", 3));
    expect(list.map((x) => [x.left, x.at])).toEqual([["/a", 3], ["/c", 2]]);
  });
  it("file e cartelle con gli stessi percorsi sono confronti diversi", () => {
    expect(addRecent([r("/a", 1, "files")], r("/a", 2, "dirs"))).toHaveLength(2);
  });
  it("si ferma al massimo", () => {
    const many = Array.from({ length: 5 }, (_, i) => r(`/f${i}`, i));
    expect(addRecent(many, r("/nuovo", 9), 3).map((x) => x.left)).toEqual(["/nuovo", "/f0", "/f1"]);
  });
});

describe("removeRecent", () => {
  it("toglie solo quel confronto (stessa modalità e stessi due percorsi)", () => {
    const list = [r("/a", 1, "files"), r("/a", 2, "dirs"), r("/a", 3, "files", "/altro"), r("/c", 4)];
    expect(removeRecent(list, { mode: "files", left: "/a", right: "/b" }).map((x) => [x.mode, x.left, x.right])).toEqual([
      ["dirs", "/a", "/b"],
      ["files", "/a", "/altro"],
      ["files", "/c", "/b"],
    ]);
  });
  it("se non c'è, l'elenco resta com'è", () => {
    const list = [r("/a")];
    expect(removeRecent(list, { mode: "dirs", left: "/x", right: "/y" })).toEqual(list);
  });
});

describe("parseRecents", () => {
  it("legge un elenco valido", () => {
    expect(parseRecents(JSON.stringify([r("/a")]))).toEqual([r("/a")]);
  });
  it("contenuti assenti o rovinati danno un elenco vuoto", () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents("")).toEqual([]);
    expect(parseRecents("{non json")).toEqual([]);
    expect(parseRecents('{"a":1}')).toEqual([]);
  });
  it("scarta le voci non valide e tiene le altre", () => {
    const text = JSON.stringify([r("/a"), { mode: "boh", left: "x", right: "y", at: 1 }, 5, null]);
    expect(parseRecents(text)).toEqual([r("/a")]);
  });
});
