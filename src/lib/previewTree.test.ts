import { describe, expect, it } from "vitest";
import type { DirListing, EntryKind } from "../types";
import {
  buildPreviewRows,
  isSwap,
  key,
  nextExpandStep,
  pendingLoads,
  swapCache,
  swapKey,
  swapSizes,
  type Listing,
} from "./previewTree";

const e = (name: string, kind: EntryKind = "file"): DirListing => ({ name, kind, size: 0, modified: null });
const roots = { left: "/l", right: "/r" };

describe("chiavi e scambio dei lati", () => {
  it("la chiave per lato e percorso, e la stessa chiave scambiata", () => {
    expect(key("left", "a/b")).toBe("left\0a/b");
    expect(swapKey(key("left", "a/b"))).toBe(key("right", "a/b"));
    expect(swapKey(key("right", ""))).toBe(key("left", ""));
  });
  it("isSwap: solo due cartelle scambiate, non cambiate né uguali", () => {
    expect(isSwap({ left: "/l", right: "/r" }, { left: "/r", right: "/l" })).toBe(true);
    expect(isSwap({ left: "/l", right: "/r" }, { left: "/r", right: "/x" })).toBe(false);
    expect(isSwap({ left: "/l", right: "/r" }, { left: "/l", right: "/r" })).toBe(false);
    expect(isSwap({ left: "/a", right: "/a" }, { left: "/a", right: "/a" })).toBe(false);
    expect(isSwap({ left: "/l", right: "" }, { left: "", right: "/l" })).toBe(false);
  });
  it("swapCache scambia i lati e scarta le letture in corso", () => {
    const cache: Record<string, Listing> = {
      [key("left", "")]: [e("a")],
      [key("right", "")]: "loading",
      [key("left", "d")]: { error: "no" },
    };
    expect(swapCache(cache)).toEqual({ [key("right", "")]: [e("a")], [key("right", "d")]: { error: "no" } });
  });
  it("swapSizes scambia i lati e scarta i calcoli in corso", () => {
    expect(swapSizes({ [key("left", "d")]: 10, [key("right", "d")]: "loading", [key("right", "x")]: "error" })).toEqual({
      [key("right", "d")]: 10,
      [key("left", "x")]: "error",
    });
  });
});

describe("buildPreviewRows", () => {
  const cache: Record<string, Listing> = {
    [key("left", "")]: [e("d", "dir"), e("solo-sx.txt")],
    [key("right", "")]: [e("d", "dir"), e("solo-dx.txt")],
    [key("left", "d")]: [e("f.txt")],
    [key("right", "d")]: [e("f.txt"), e("g.txt")],
  };
  it("affianca per nome: cartelle prima, poi i file", () => {
    const rows = buildPreviewRows(cache, new Set(), roots);
    expect(rows.map((r) => r.rel)).toEqual(["d", "solo-dx.txt", "solo-sx.txt"]);
    expect(rows[0].isDir && !rows[0].expanded).toBe(true);
  });
  it("una cartella aperta e già letta mostra i figli sotto di sé", () => {
    const rows = buildPreviewRows(cache, new Set(["d"]), roots);
    expect(rows.map((r) => [r.rel, r.depth])).toEqual([["d", 0], ["d/f.txt", 1], ["d/g.txt", 1], ["solo-dx.txt", 0], ["solo-sx.txt", 0]]);
    expect(rows[0].expanded && !rows[0].loading).toBe(true);
  });
  it("una cartella aperta ma non letta è «in lettura» e non ha figli", () => {
    const { [key("left", "d")]: _a, ...partial } = cache;
    const rows = buildPreviewRows(partial, new Set(["d"]), roots);
    expect(rows.map((r) => r.rel)).toEqual(["d", "solo-dx.txt", "solo-sx.txt"]);
    expect(rows[0].loading).toBe(true);
  });
  it("una cartella illeggibile da un lato è segnata", () => {
    const rows = buildPreviewRows({ ...cache, [key("left", "d")]: { error: "no" } }, new Set(["d"]), roots);
    expect(rows[0].failed).toBe(true);
  });
  it("senza le radici lette non ci sono righe", () => {
    expect(buildPreviewRows({}, new Set(), roots)).toEqual([]);
    expect(buildPreviewRows({ [key("left", "")]: "loading" }, new Set(), roots)).toEqual([]);
  });
  it("una radice vuota non si aspetta", () => {
    const rows = buildPreviewRows({ [key("left", "")]: [e("a")] }, new Set(), { left: "/l", right: "" });
    expect(rows.map((r) => r.rel)).toEqual(["a"]);
  });
});

describe("pendingLoads", () => {
  it("prima le radici non lette", () => {
    expect(pendingLoads([], {}, roots)).toEqual([{ side: "left", rel: "" }, { side: "right", rel: "" }]);
    expect(pendingLoads([], { [key("left", "")]: [] }, roots)).toEqual([{ side: "right", rel: "" }]);
    expect(pendingLoads([], {}, { left: "/l", right: " " })).toEqual([{ side: "left", rel: "" }]);
  });
  it("poi le cartelle aperte non ancora lette, solo dai lati in cui sono cartelle", () => {
    const cache: Record<string, Listing> = {
      [key("left", "")]: [e("d", "dir")],
      [key("right", "")]: [e("d", "dir")],
      [key("left", "d")]: [],
    };
    const rows = buildPreviewRows(cache, new Set(["d"]), roots);
    expect(pendingLoads(rows, cache, roots)).toEqual([{ side: "right", rel: "d" }]);
    const closed = buildPreviewRows(cache, new Set(), roots);
    expect(pendingLoads(closed, cache, roots)).toEqual([]);
  });
});

describe("nextExpandStep", () => {
  const row = (rel: string, over: Partial<{ isDir: boolean; expanded: boolean; loading: boolean }> = {}) => ({
    rel,
    depth: 0,
    pair: { name: rel, left: null, right: null },
    isDir: true,
    expanded: false,
    loading: false,
    failed: false,
    ...over,
  });
  it("aspetta se una cartella aperta è ancora in lettura", () => {
    expect(nextExpandStep([row("a", { expanded: true, loading: true }), row("b")], 10, 5)).toEqual({ kind: "wait" });
  });
  it("ha finito quando non restano cartelle chiuse", () => {
    expect(nextExpandStep([row("f", { isDir: false }), row("a", { expanded: true })], 10, 5)).toEqual({ kind: "done" });
    expect(nextExpandStep([], 10, 5)).toEqual({ kind: "done" });
  });
  it("apre un gruppo, non più del gruppo né del budget", () => {
    const rows = ["a", "b", "c", "d"].map((r) => row(r));
    expect(nextExpandStep(rows, 10, 3)).toEqual({ kind: "open", rels: ["a", "b", "c"], remaining: 7 });
    expect(nextExpandStep(rows, 2, 3)).toEqual({ kind: "open", rels: ["a", "b"], remaining: 0 });
  });
});
