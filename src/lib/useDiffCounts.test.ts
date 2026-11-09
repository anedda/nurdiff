import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirEntryDiff } from "../types";
import { act, renderHook } from "../test/renderHook";
import { countKey, countOf } from "./diffCounts";

const pending: { left: string; right: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
vi.mock("../api", () => ({
  fileDiffStats: (left: string, right: string) =>
    new Promise((resolve, reject) => pending.push({ left, right, resolve, reject })),
}));

const { useDiffCounts } = await import("./useDiffCounts");

const entry = (path: string, extra: Partial<DirEntryDiff> = {}): DirEntryDiff => ({
  path,
  status: "different",
  leftKind: "file",
  rightKind: "file",
  leftSize: 1,
  rightSize: 2,
  leftModified: 10,
  rightModified: 20,
  ...extra,
});
const stats = { kind: "lines" as const, equal: 5, changed: 1, leftOnly: 0, rightOnly: 2 };

beforeEach(() => {
  pending.length = 0;
});

describe("useDiffCounts", () => {
  it("al massimo tre richieste insieme; le altre partono man mano", async () => {
    const h = renderHook(() => useDiffCounts("/l", "/r"), undefined);
    const files = ["a", "b", "c", "d", "e"].map((n) => entry(n));
    act(() => files.forEach((f) => h.current.request(f)));
    expect(pending).toHaveLength(3);
    expect(pending.map((p) => p.left)).toEqual(["/l/a", "/l/b", "/l/c"]);
    await act(async () => pending[0].resolve(stats));
    expect(pending).toHaveLength(4);
    expect(h.current.counts[countKey(files[0])]).toEqual(stats);
    expect(h.current.counts[countKey(files[3])]).toBe("loading");
  });

  it("lo stesso file si chiede una volta sola", () => {
    const h = renderHook(() => useDiffCounts("/l", "/r"), undefined);
    const f = entry("a");
    act(() => {
      h.current.request(f);
      h.current.request(f);
    });
    expect(pending).toHaveLength(1);
  });

  it("un file non di testo ha «binary», uno troppo grande per il core «large», un errore «error»", async () => {
    const h = renderHook(() => useDiffCounts("/l", "/r"), undefined);
    const [a, b, c] = [entry("a"), entry("b"), entry("c")];
    act(() => {
      h.current.request(a);
      h.current.request(b);
      h.current.request(c);
    });
    await act(async () => pending[0].resolve({ kind: "binary" }));
    await act(async () => pending[1].reject("errore"));
    await act(async () => pending[2].resolve({ kind: "tooLarge" }));
    expect(h.current.counts[countKey(a)]).toBe("binary");
    expect(h.current.counts[countKey(b)]).toBe("error");
    expect(h.current.counts[countKey(c)]).toBe("large");
  });

  it("ritirare una richiesta non ancora partita la toglie dalla coda", () => {
    const h = renderHook(() => useDiffCounts("/l", "/r"), undefined);
    const files = ["a", "b", "c", "d"].map((n) => entry(n));
    act(() => files.forEach((f) => h.current.request(f)));
    act(() => h.current.cancel(files[3])); // the fourth did not start
    act(() => pending[0].resolve(stats));
    expect(pending).toHaveLength(3); // the fourth did not start even afterwards
  });

  it("con altre cartelle i risultati vecchi non valgono più", async () => {
    const h = renderHook(({ left }) => useDiffCounts(left, "/r"), { left: "/l" });
    const f = entry("a");
    act(() => h.current.request(f));
    await act(async () => pending[0].resolve(stats));
    expect(h.current.counts[countKey(f)]).toEqual(stats);
    h.rerender({ left: "/altra" });
    expect(h.current.counts).toEqual({});
  });

  it("la risposta di prima del cambio di cartelle si scarta", async () => {
    const h = renderHook(({ left }) => useDiffCounts(left, "/r"), { left: "/l" });
    const f = entry("a");
    act(() => h.current.request(f));
    h.rerender({ left: "/altra" });
    await act(async () => pending[0].resolve(stats)); // it arrives late
    expect(h.current.counts[countKey(f)]).toBeUndefined();
  });

  it("un file che già dalle dimensioni supera i 16 MB non si chiede: «countOf» dà «large»", () => {
    const h = renderHook(() => useDiffCounts("/l", "/r"), undefined);
    const big = entry("big.log", { rightSize: 17 * 1024 * 1024 });
    act(() => h.current.request(big));
    expect(pending).toHaveLength(0);
    expect(countOf(big, h.current.counts)).toBe("large");
  });
});
