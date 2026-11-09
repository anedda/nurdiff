import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { Mode } from "../types";
import { act, renderHook, stubWindow } from "../test/renderHook";
import { DEFAULT_SETTINGS } from "./settings";
import type { DropContext } from "./useWindowDrop";

let handler: ((e: unknown) => void) | null = null;
let kinds: string[] = [];
const unlisten = vi.fn();
vi.mock("../api", () => ({
  inTauri: true,
  classifyPaths: () => Promise.resolve(kinds),
  onFileDrag: (h: (e: unknown) => void) => {
    handler = h;
    return Promise.resolve(unlisten);
  },
}));

const { useWindowDrop } = await import("./useWindowDrop");

const t = ((key: string) => key) as never;
const send = (e: unknown) => act(async () => void handler!(e));

function setup(over: Partial<DropContext> = {}, working = false) {
  const calls: string[] = [];
  const errors: (string | null)[] = [];
  const latest = {
    current: {
      active: true,
      mode: null as Mode | null,
      left: "",
      right: "",
      settings: DEFAULT_SETTINGS,
      t,
      runWith: async (m: Mode, l: string, r: string) => {
        calls.push(`run:${m}:${l}:${r}`);
        return true;
      },
      setMode: (m: Mode) => calls.push(`mode:${m}`),
      setLeft: (p: string) => calls.push(`left:${p}`),
      setRight: (p: string) => calls.push(`right:${p}`),
      showPreview: (l: string, r: string) => calls.push(`preview:${l}:${r}`),
      ...over,
    },
  } as MutableRefObject<DropContext>;
  const work = { current: working };
  const h = renderHook(() => useWindowDrop(latest, work, (m) => errors.push(m)), undefined);
  return { h, calls, errors, latest };
}

beforeEach(async () => {
  handler = null;
  kinds = [];
  const win = stubWindow();
  void win;
  (window as unknown as { innerWidth: number }).innerWidth = 1000;
});
afterEach(() => vi.unstubAllGlobals());

async function ready() {
  await act(async () => {}); // subscribing to the event is a promise
}

describe("useWindowDrop", () => {
  it("mostra quanti elementi si stanno trascinando e su quale metà, e toglie tutto all'uscita", async () => {
    const { h } = setup();
    await ready();
    await send({ type: "enter", paths: ["/a", "/b"], x: 100, y: 5 });
    expect(h.current).toEqual({ count: 2, hover: "left" });
    await send({ type: "over", x: 900, y: 5 });
    expect(h.current).toEqual({ count: 2, hover: "right" });
    await send({ type: "leave" });
    expect(h.current).toBeNull();
  });

  it("due file rilasciati si confrontano subito", async () => {
    kinds = ["file", "file"];
    const { calls, errors } = setup();
    await ready();
    await send({ type: "drop", paths: ["/a.txt", "/b.txt"], x: 100, y: 5 });
    await act(async () => {});
    expect(calls).toEqual(["mode:files", "left:/a.txt", "right:/b.txt", "run:files:/a.txt:/b.txt"]);
    expect(errors).toEqual([null]);
  });

  it("due cartelle con il confronto non immediato mostrano l'anteprima", async () => {
    kinds = ["dir", "dir"];
    const { calls } = setup({ settings: { ...DEFAULT_SETTINGS, compareDirsOnDrop: false } as never });
    await ready();
    await send({ type: "drop", paths: ["/a", "/b"], x: 100, y: 5 });
    await act(async () => {});
    expect(calls).toContain("preview:/a:/b");
    expect(calls.some((c) => c.startsWith("run:"))).toBe(false);
  });

  it("un solo file va sul lato su cui si rilascia, senza confrontare", async () => {
    kinds = ["file"];
    const { calls } = setup();
    await ready();
    await send({ type: "drop", paths: ["/a.txt"], x: 900, y: 5 });
    await act(async () => {});
    expect(calls).toEqual(["mode:files", "left:", "right:/a.txt"]);
  });

  it("con un'altra operazione in corso o un tipo diverso da quello del tab, mostra l'errore e non fa nulla", async () => {
    kinds = ["file", "file"];
    const busy = setup({}, true);
    await ready();
    await send({ type: "drop", paths: ["/a", "/b"], x: 1, y: 1 });
    expect(busy.errors).toEqual(["ws.err.busy"]);
    expect(busy.calls).toEqual([]);
    const wrong = setup({ mode: "dirs" });
    await ready();
    await send({ type: "drop", paths: ["/a", "/b"], x: 1, y: 1 });
    expect(wrong.errors).toEqual(["ws.err.dirsTab"]);
  });

  it("un tab in secondo piano ignora il trascinamento", async () => {
    kinds = ["file", "file"];
    const { h, calls, errors } = setup({ active: false });
    await ready();
    await send({ type: "enter", paths: ["/a"], x: 1, y: 1 });
    await send({ type: "drop", paths: ["/a", "/b"], x: 1, y: 1 });
    expect(h.current).toBeNull();
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("smontando smette di ascoltare", async () => {
    const { h } = setup();
    await ready();
    h.unmount();
    expect(unlisten).toHaveBeenCalled();
  });
});
