import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirListing } from "../types";
import { act, renderHook } from "../test/renderHook";
import type { PreviewRow } from "./previewTree";

const jobs: { path: string; epoch: number; channel: string; resolve: (v: number | null) => void; reject: (e: unknown) => void }[] = [];
let epochs = 0;
const cancels: string[] = [];
vi.mock("../api", () => ({
  cancelDirectorySizes: (channel: string) => {
    cancels.push(channel);
    return Promise.resolve(++epochs);
  },
  directorySize: (path: string, epoch: number, channel: string) =>
    new Promise<number | null>((resolve, reject) => jobs.push({ path, epoch, channel, resolve, reject })),
}));

const { usePreviewSizes } = await import("./usePreviewSizes");

const dir = (name: string): DirListing => ({ name, kind: "dir", size: 0, modified: null });
const file = (name: string): DirListing => ({ name, kind: "file", size: 1, modified: null });
const row = (rel: string, left: DirListing | null, right: DirListing | null): PreviewRow => ({
  rel,
  depth: 0,
  pair: { name: rel, left, right },
  isDir: left?.kind === "dir" || right?.kind === "dir",
  expanded: false,
  loading: false,
  failed: false,
});

beforeEach(() => {
  jobs.length = 0;
  cancels.length = 0;
  epochs = 0;
});

/** The initial render: the epoch comes from a promise, so one more round is needed. */
async function mount(rows: PreviewRow[], paused = false) {
  const h = renderHook(({ shown, paused }) => usePreviewSizes("/l", "/r", shown, paused), { shown: rows, paused });
  await act(async () => {});
  return h;
}

describe("usePreviewSizes", () => {
  it("calcola le cartelle (non i file) di entrambi i lati, al massimo tre per volta", async () => {
    const rows = [row("a", dir("a"), dir("a")), row("f", file("f"), file("f")), row("b", dir("b"), null)];
    await mount(rows);
    expect(jobs.map((j) => j.path)).toEqual(["/l/a", "/r/a", "/l/b"]);
  });

  it("le altre partono man mano che finiscono, e il risultato compare", async () => {
    const rows = [row("a", dir("a"), dir("a")), row("b", dir("b"), dir("b"))];
    const h = await mount(rows);
    expect(jobs).toHaveLength(3);
    expect(h.current.sizes["left\0a"]).toBe("loading");
    await act(async () => jobs[0].resolve(1234));
    expect(h.current.sizes["left\0a"]).toBe(1234);
    expect(jobs).toHaveLength(4);
  });

  it("ogni anteprima annulla e calcola sul suo canale: chiuderne una non ferma le altre", async () => {
    const a = await mount([row("a", dir("a"), null)]);
    await mount([row("b", dir("b"), null)]);
    const [ca, cb] = jobs.map((j) => j.channel);
    expect(ca).not.toBe(cb);
    a.unmount();
    expect(cancels.at(-1)).toBe(ca);
  });

  it("dopo un Refresh con tre calcoli in corso, i nuovi partono quando finiscono i vecchi", async () => {
    const rows = [row("a", dir("a"), dir("a")), row("b", dir("b"), dir("b"))];
    const h = await mount(rows);
    expect(jobs).toHaveLength(3);
    await act(async () => h.current.restart());
    expect(jobs).toHaveLength(3);
    await act(async () => jobs[0].resolve(1));
    expect(jobs).toHaveLength(4);
    expect(jobs[3].epoch).toBe(2);
    await act(async () => {
      jobs[1].resolve(1);
      jobs[2].resolve(1);
    });
    expect(jobs).toHaveLength(6);
  });

  it("chiusa l'anteprima, i calcoli che finiscono non fanno partire quelli in coda", async () => {
    const h = await mount([row("a", dir("a"), dir("a")), row("b", dir("b"), dir("b"))]);
    expect(jobs).toHaveLength(3);
    h.unmount();
    await act(async () => jobs[0].resolve(1));
    expect(jobs).toHaveLength(3);
  });

  it("un calcolo fallito dà «error»", async () => {
    const h = await mount([row("a", dir("a"), null)]);
    await act(async () => jobs[0].reject("nope"));
    expect(h.current.sizes["left\0a"]).toBe("error");
  });

  it("in pausa (Expand) non parte niente", async () => {
    await mount([row("a", dir("a"), dir("a"))], true);
    expect(jobs).toHaveLength(0);
  });

  it("scambiando i lati si tengono i risultati già pronti, con i lati scambiati", async () => {
    const rows = [row("a", dir("a"), dir("a"))];
    const h = renderHook(({ left, right, shown }) => usePreviewSizes(left, right, shown, false), { left: "/l", right: "/r", shown: rows });
    await act(async () => {});
    await act(async () => jobs[0].resolve(10)); // left
    await act(async () => jobs[1].resolve(20)); // right
    expect(h.current.sizes).toEqual({ "left\0a": 10, "right\0a": 20 });
    h.rerender({ left: "/r", right: "/l", shown: rows });
    await act(async () => {});
    expect(h.current.sizes).toEqual({ "left\0a": 20, "right\0a": 10 });
  });

  it("con altre cartelle si riparte da zero", async () => {
    const rows = [row("a", dir("a"), null)];
    const h = renderHook(({ left, shown }) => usePreviewSizes(left, "/r", shown, false), { left: "/l", shown: rows });
    await act(async () => {});
    await act(async () => jobs[0].resolve(10));
    h.rerender({ left: "/altra", shown: rows });
    await act(async () => {});
    expect(h.current.sizes["left\0a"]).toBe("loading");
  });
});
