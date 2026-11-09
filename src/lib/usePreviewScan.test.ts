import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirScan } from "../types";
import { act, renderHook } from "../test/renderHook";
import { EMPTY_EXT_FILTER } from "./extFilter";

const scans: { left: string; right: string; epoch: number; resolve: (s: DirScan) => void; reject: (e: unknown) => void }[] = [];
let epochs = 0;
const cancels = vi.fn();
vi.mock("../api", () => ({
  cancelDirectoryScan: () => {
    cancels();
    return Promise.resolve(++epochs);
  },
  scanDirectories: (left: string, right: string, _filter: unknown, epoch: number) =>
    new Promise<DirScan>((resolve, reject) => scans.push({ left, right, epoch, resolve, reject })),
}));

const { usePreviewScan } = await import("./usePreviewScan");

const result = (extra: Partial<DirScan> = {}): DirScan => ({ leftOnly: 3, rightOnly: 1, typeMismatch: 0, filePairs: 2, visited: 10, truncated: false, ...extra });

beforeEach(() => {
  scans.length = 0;
  epochs = 0;
  cancels.mockClear();
});

const mount = async (left: string, right: string) => {
  const h = renderHook(({ left, right }) => usePreviewScan(left, right, EMPTY_EXT_FILTER), { left, right });
  await act(async () => {});
  return h;
};

describe("usePreviewScan", () => {
  it("parte da sola con due cartelle: scansione in corso, poi il risultato", async () => {
    const h = await mount("/l", "/r");
    expect(scans).toHaveLength(1);
    expect(h.current.scanning).toBe(true);
    expect(h.current.scan).toBeNull();
    await act(async () => scans[0].resolve(result()));
    expect(h.current.scanning).toBe(false);
    expect(h.current.scan).toEqual(result());
  });

  it("con un campo vuoto non scansiona e annulla quella in corso", async () => {
    const h = await mount("/l", "  ");
    expect(scans).toHaveLength(0);
    expect(h.current.scanning).toBe(false);
    expect(cancels).toHaveBeenCalled();
  });

  it("rescan rifà la scansione (Refresh, filtro) e azzera il risultato", async () => {
    const h = await mount("/l", "/r");
    await act(async () => scans[0].resolve(result()));
    await act(async () => h.current.rescan());
    expect(h.current.scan).toBeNull();
    expect(scans).toHaveLength(2);
    expect(scans[1].epoch).toBeGreaterThan(scans[0].epoch);
  });

  it("scambiando i lati si tiene il risultato con i conteggi invertiti, senza riscansionare", async () => {
    const h = await mount("/l", "/r");
    await act(async () => scans[0].resolve(result()));
    h.rerender({ left: "/r", right: "/l" });
    await act(async () => {});
    expect(scans).toHaveLength(1);
    expect(h.current.scan).toMatchObject({ leftOnly: 1, rightOnly: 3, filePairs: 2 });
  });

  it("la risposta di una scansione superata si scarta", async () => {
    const h = await mount("/l", "/r");
    h.rerender({ left: "/altra", right: "/r" }); // folders changed: it starts again
    await act(async () => {});
    expect(scans).toHaveLength(2);
    await act(async () => scans[0].resolve(result({ leftOnly: 99 }))); // it arrives late
    expect(h.current.scan).toBeNull();
    await act(async () => scans[1].resolve(result({ leftOnly: 5 })));
    expect(h.current.scan).toMatchObject({ leftOnly: 5 });
  });

  it("una scansione fallita lascia «nessun risultato»", async () => {
    const h = await mount("/l", "/r");
    await act(async () => scans[0].reject("errore"));
    expect(h.current.scan).toBeNull();
    expect(h.current.scanning).toBe(false);
  });

  it("allo smontaggio annulla la scansione e ignora la risposta", async () => {
    const h = await mount("/l", "/r");
    cancels.mockClear();
    h.unmount();
    expect(cancels).toHaveBeenCalled();
  });
});
