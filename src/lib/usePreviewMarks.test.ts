import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import type { DirEntryDiff } from "../types";
import { act, renderHook } from "../test/renderHook";
import { EMPTY_EXT_FILTER } from "./extFilter";

let answer: () => Promise<DirEntryDiff[] | null>;
const asked: { rel: string }[] = [];
vi.mock("../api", () => ({
  recompareEntry: (_l: string, _r: string, rel: string) => {
    asked.push({ rel });
    return answer();
  },
}));

const { usePreviewMarks } = await import("./usePreviewMarks");

const entry = (path: string, extra: Partial<DirEntryDiff> = {}): DirEntryDiff => ({
  path,
  status: "different",
  leftKind: "file",
  rightKind: "file",
  leftSize: 1,
  rightSize: 1,
  leftModified: null,
  rightModified: null,
  ...extra,
});
const t = ((key: string) => key) as never;
const roots = { left: "/l", right: "/r" };

function setup(preview: typeof roots | null, working = false) {
  const cancelled = vi.fn();
  const h = renderHook(
    (p: typeof roots | null) => {
      const ref = useRef(working);
      return usePreviewMarks(p, ref, t, cancelled, EMPTY_EXT_FILTER, "tab1");
    },
    preview,
  );
  return { h, cancelled };
}

beforeEach(() => {
  asked.length = 0;
});

describe("usePreviewMarks", () => {
  it("un file: «…» mentre aspetta, poi il segno «uguale» o «diverso»", async () => {
    const { h } = setup(roots);
    let release!: (e: DirEntryDiff[]) => void;
    answer = () => new Promise((r) => (release = r));
    let pending!: Promise<void>;
    act(() => void (pending = h.current.compare("a.txt")));
    expect(h.current.marks.get("a.txt")).toBe("busy");
    await act(async () => {
      release([entry("a.txt", { status: "identical" })]);
      await pending;
    });
    expect(h.current.marks.get("a.txt")).toEqual({ status: "identical" });
  });

  it("una cartella: segno per ogni voce con i due lati e riepilogo per le cartelle", async () => {
    const { h } = setup(roots);
    answer = () =>
      Promise.resolve([
        entry("d", { leftKind: "dir", rightKind: "dir" }),
        entry("d/x.txt"),
        entry("d/solo.txt", { status: "leftOnly", rightKind: null }),
      ]);
    await act(async () => h.current.compare("d"));
    expect(h.current.marks.get("d/x.txt")).toEqual({ status: "different" });
    expect(h.current.marks.has("d/solo.txt")).toBe(false); // one side only: no mark
    expect(h.current.stats.has("d")).toBe(true);
  });

  it("annullato: nessun segno e si avvisa; fallito: l'errore", async () => {
    const { h, cancelled } = setup(roots);
    answer = () => Promise.resolve(null);
    await act(async () => h.current.compare("a.txt"));
    expect(h.current.marks.size).toBe(0);
    expect(cancelled).toHaveBeenCalledTimes(1);
    answer = () => Promise.reject("nope");
    await act(async () => h.current.compare("a.txt"));
    expect(h.current.marks.get("a.txt")).toEqual({ error: "nope" });
  });

  it("una voce sparita (risposta vuota) ha il suo messaggio", async () => {
    const { h } = setup(roots);
    answer = () => Promise.resolve([]);
    await act(async () => h.current.compare("a.txt"));
    expect(h.current.marks.get("a.txt")).toEqual({ error: "preview.vanished" });
  });

  it("una cartella svuotata dal filtro (il core la dà da sola) è uguale e perde i segni vecchi dei figli", async () => {
    const filter = { ...EMPTY_EXT_FILTER, includeExts: ["rs"] };
    const h = renderHook(() => usePreviewMarks(roots, useRef(false), t, vi.fn(), filter, "tab1"), undefined);
    const docs = entry("docs", { status: "identical", leftKind: "dir", rightKind: "dir" });
    answer = () => Promise.resolve([docs, entry("docs/a.rs", { status: "identical" })]);
    await act(async () => h.current.compare("docs"));
    answer = () => Promise.resolve([docs]);
    await act(async () => h.current.compare("docs"));
    expect(h.current.marks.get("docs")).toEqual({ status: "identical" });
    expect(h.current.marks.has("docs/a.rs")).toBe(false);
    expect(h.current.stats.get("docs")).toMatchObject({ identical: 0, different: 0 });
    // an entry that no longer exists stays "vanished", filter or not
    answer = () => Promise.resolve([]);
    await act(async () => h.current.compare("main.rs"));
    expect(h.current.marks.get("main.rs")).toEqual({ error: "preview.vanished" });
  });

  it("il risultato arrivato dopo un reset o una nuova lettura non si applica; dopo uno scambio i riepiloghi si invertono", async () => {
    const { h } = setup(roots);
    let release!: (e: DirEntryDiff[]) => void;
    const dirEntries = [entry("d", { leftKind: "dir", rightKind: "dir" }), entry("d/s.txt", { status: "leftOnly", rightKind: null })];
    for (const drop of [h.current.reset, h.current.clearResults]) {
      answer = () => new Promise((r) => (release = r));
      let pending!: Promise<void>;
      act(() => void (pending = h.current.compare("d")));
      act(() => drop());
      await act(async () => {
        release(dirEntries);
        await pending;
      });
      expect(h.current.marks.size + h.current.stats.size).toBe(0);
    }
    answer = () => new Promise((r) => (release = r));
    let pending!: Promise<void>;
    act(() => void (pending = h.current.compare("d")));
    act(() => h.current.swapSides());
    await act(async () => {
      release(dirEntries);
      await pending;
    });
    expect(h.current.stats.get("d")).toMatchObject({ leftOnly: 0, rightOnly: 1 });
  });

  it("senza anteprima o con un'altra operazione in corso non fa nulla", async () => {
    const none = setup(null);
    const busy = setup(roots, true);
    await act(async () => none.h.current.compare("a.txt"));
    await act(async () => busy.h.current.compare("a.txt"));
    expect(asked).toEqual([]);
  });

  it("reset toglie tutto, clearResults tiene la scelta, swapSides inverte i riepiloghi", async () => {
    const { h } = setup(roots);
    answer = () => Promise.resolve([entry("d", { leftKind: "dir", rightKind: "dir" }), entry("d/s.txt", { status: "leftOnly", rightKind: null })]);
    await act(async () => h.current.compare("d"));
    const before = h.current.stats.get("d")!;
    act(() => h.current.setSel({ rel: "d", side: "left", kind: "dir" } as never));
    act(() => h.current.swapSides());
    expect(h.current.stats.get("d")).toEqual({ ...before, leftOnly: before.rightOnly, rightOnly: before.leftOnly });
    act(() => h.current.clearResults());
    expect(h.current.marks.size + h.current.stats.size).toBe(0);
    expect(h.current.sel).not.toBeNull();
    act(() => h.current.reset());
    expect(h.current.sel).toBeNull();
  });
});
