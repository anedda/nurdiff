import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import type { DirDiff, DirEntryDiff } from "../types";
import { act, renderHook } from "../test/renderHook";
import { EMPTY_EXT_FILTER as NOFILTER } from "./extFilter";
import type { DirView } from "./useDirRows";

let answer: () => Promise<DirEntryDiff[] | null>;
const asked: { l: string; r: string; rel: string }[] = [];
vi.mock("../api", () => ({
  recompareEntry: (l: string, r: string, rel: string) => {
    asked.push({ l, r, rel });
    return answer();
  },
}));

const { useDirRows } = await import("./useDirRows");

const entry = (path: string, status: DirEntryDiff["status"] = "different"): DirEntryDiff => ({
  path,
  status,
  leftKind: "file",
  rightKind: "file",
  leftSize: 1,
  rightSize: 1,
  leftModified: null,
  rightModified: null,
});
const stats = { identical: 0, different: 1, leftOnly: 0, rightOnly: 0, typeMismatch: 0, minor: 0 };
const viewOf = (entries: DirEntryDiff[]): DirView => ({
  diff: { entries, stats } as unknown as DirDiff,
  left: "/l",
  right: "/r",
  filter: NOFILTER,
});

const t = ((key: string) => key) as never;

function setup(initial: DirView | null, opts: { working?: boolean } = {}) {
  const cancelled = vi.fn();
  const h = renderHook(
    (view: DirView | null) => {
      const [dirView, setDirView] = useState<DirView | null>(view);
      const working = useRef(opts.working ?? false);
      return { dirView, rows: useDirRows(dirView, setDirView, working, t, cancelled, "tab1"), working };
    },
    initial,
  );
  return { h, cancelled };
}

beforeEach(() => {
  asked.length = 0;
});

describe("useDirRows", () => {
  it("confronta una riga: «…» mentre aspetta, poi aggiorna il confronto e tiene la riga", async () => {
    const { h } = setup(viewOf([entry("a.txt"), entry("b.txt")]));
    let release!: (e: DirEntryDiff[]) => void;
    answer = () => new Promise((r) => (release = r));
    let pending!: Promise<void>;
    act(() => void (pending = h.current.rows.compare("a.txt")));
    expect(h.current.rows.marks.get("a.txt")).toBe("busy");
    await act(async () => {
      release([entry("a.txt", "identical")]);
      await pending;
    });
    expect(asked).toEqual([{ l: "/l", r: "/r", rel: "a.txt" }]);
    expect(h.current.rows.marks.has("a.txt")).toBe(false);
    expect(h.current.rows.keep.has("a.txt")).toBe(true);
    expect(h.current.dirView!.diff.entries.find((e) => e.path === "a.txt")!.status).toBe("identical");
  });

  it("annullato: la riga resta com'era e si avvisa", async () => {
    const { h, cancelled } = setup(viewOf([entry("a.txt")]));
    answer = () => Promise.resolve(null);
    await act(async () => h.current.rows.compare("a.txt"));
    expect(h.current.rows.marks.has("a.txt")).toBe(false);
    expect(h.current.rows.keep.size).toBe(0);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("fallito: il segno è l'errore", async () => {
    const { h } = setup(viewOf([entry("a.txt")]));
    answer = () => Promise.reject("disco pieno");
    await act(async () => h.current.rows.compare("a.txt"));
    expect(h.current.rows.marks.get("a.txt")).toEqual({ error: "disco pieno" });
  });

  it("senza confronto, o con un'altra operazione in corso, non fa nulla", async () => {
    const none = setup(null);
    await act(async () => none.h.current.rows.compare("a.txt"));
    const busy = setup(viewOf([entry("a.txt")]), { working: true });
    await act(async () => busy.h.current.rows.compare("a.txt"));
    expect(asked).toEqual([]);
  });

  it("un risultato arrivato dopo un nuovo confronto (reset) non si applica", async () => {
    const { h } = setup(viewOf([entry("a.txt")]));
    let release!: (e: DirEntryDiff[]) => void;
    answer = () => new Promise((r) => (release = r));
    let pending!: Promise<void>;
    act(() => void (pending = h.current.rows.compare("a.txt")));
    act(() => h.current.rows.reset());
    await act(async () => {
      release([entry("a.txt", "identical")]);
      await pending;
    });
    expect(h.current.dirView!.diff.entries[0].status).toBe("different");
    expect(h.current.rows.keep.size + h.current.rows.marks.size).toBe(0);
  });

  it("con il filtro attivo, una cartella che il filtro svuota perde la riga, come nel confronto intero", async () => {
    const dir = { ...entry("docs", "identical"), leftKind: "dir" as const, rightKind: "dir" as const };
    const view = { ...viewOf([dir, entry("docs/a.rs")]), filter: { ...NOFILTER, includeExts: ["rs"] } };
    const { h } = setup(view);
    answer = () => Promise.resolve([dir]);
    await act(async () => h.current.rows.compare("docs"));
    expect(h.current.dirView!.diff.entries).toEqual([]);
  });

  it("clearKeep e reset", async () => {
    const { h } = setup(viewOf([entry("a.txt")]));
    answer = () => Promise.resolve([entry("a.txt", "identical")]);
    await act(async () => h.current.rows.compare("a.txt"));
    act(() => h.current.rows.clearKeep());
    expect(h.current.rows.keep.size).toBe(0);
    answer = () => Promise.reject("x");
    await act(async () => h.current.rows.compare("a.txt"));
    expect(h.current.rows.marks.size).toBe(1);
    act(() => h.current.rows.reset());
    expect(h.current.rows.marks.size).toBe(0);
  });
});
