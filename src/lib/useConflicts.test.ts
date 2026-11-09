import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConflictView, Resolution } from "../types";
import { act, renderHook } from "../test/renderHook";

const log: string[] = [];
let fail: string | null = null;
let hold: Promise<void> | null = null;
const view = (n: number, unresolved: number): ConflictView => ({ id: 9, path: "/m.txt", segments: [], total: 2, unresolved, dirty: n > 0, canUndo: n > 0 });
let step = 0;

vi.mock("../api", () => ({
  openConflicts: async (path: string) => {
    log.push(`open(${path})`);
    if (fail === "open") throw "no";
    step = 0;
    return view(0, 2);
  },
  resolveConflict: async (id: number, index: number, r: Resolution) => {
    log.push(`resolve(${id},${index},${r.kind})`);
    if (hold) await hold;
    if (fail === "resolve") throw "no";
    return view(++step, 1);
  },
  undoConflicts: async (id: number) => {
    log.push(`undo(${id})`);
    return view(--step, 2);
  },
  saveConflicts: async (id: number) => {
    log.push(`save(${id})`);
    return { ...view(0, 0), dirty: false };
  },
  releaseDiff: async (id: number) => {
    log.push(`release(${id})`);
  },
}));

const { useConflicts } = await import("./useConflicts");

beforeEach(() => {
  log.length = 0;
  fail = null;
  hold = null;
});

const mount = async (path = "/m.txt") => {
  const h = renderHook((p: string) => useConflicts(p), path);
  await act(async () => {});
  return h;
};

describe("useConflicts", () => {
  it("apre il file e ne tiene lo stato; scelte, annulla e salva passano dal core", async () => {
    const h = await mount();
    expect(log).toEqual(["open(/m.txt)"]);
    expect(h.current.view?.unresolved).toBe(2);
    await act(async () => void (await h.current.resolve(0, { kind: "ours" })));
    expect(h.current.view).toMatchObject({ unresolved: 1, dirty: true });
    await act(async () => void (await h.current.undo()));
    expect(h.current.view?.dirty).toBe(false);
    await act(async () => void (await h.current.save()));
    expect(log).toEqual(["open(/m.txt)", "resolve(9,0,ours)", "undo(9)", "save(9)"]);
  });

  it("smontando libera il file", async () => {
    const h = await mount();
    h.unmount();
    expect(log.at(-1)).toBe("release(9)");
  });

  it("un errore si mostra, non chiude il file e si può togliere", async () => {
    const h = await mount();
    fail = "resolve";
    let ok = true;
    await act(async () => void (ok = await h.current.resolve(0, { kind: "theirs" })));
    expect(ok).toBe(false);
    expect(h.current.error).toBe("no");
    expect(h.current.view).not.toBeNull();
    act(() => h.current.clearError());
    expect(h.current.error).toBeNull();
  });

  it("se non si apre l'errore resta e non c'è niente da liberare", async () => {
    fail = "open";
    const h = await mount();
    expect(h.current.error).toBe("no");
    expect(h.current.view).toBeNull();
    h.unmount();
    expect(log).toEqual(["open(/m.txt)"]);
  });

  it("una scelta alla volta: mentre una è in corso le altre non partono", async () => {
    const h = await mount();
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    let first!: Promise<boolean>;
    let second = true;
    await act(async () => {
      first = h.current.resolve(0, { kind: "ours" });
      second = await h.current.resolve(1, { kind: "theirs" });
    });
    expect(second).toBe(false);
    release();
    await act(async () => void (await first));
    expect(log.filter((l) => l.startsWith("resolve"))).toEqual(["resolve(9,0,ours)"]);
  });
});
