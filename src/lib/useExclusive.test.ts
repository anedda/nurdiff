import { describe, expect, it } from "vitest";
import { act, renderHook } from "../test/renderHook";
import { useExclusive } from "./useExclusive";

const t = ((key: string) => key) as never;

describe("useExclusive", () => {
  it("esegue il lavoro, segna l'occupato e lo toglie alla fine", async () => {
    const h = renderHook(() => useExclusive(t), undefined);
    let release!: () => void;
    let result: unknown;
    await act(async () => {
      const p = h.current.exclusive(() => new Promise<string>((r) => (release = () => r("fatto"))));
      expect(h.current.working.current).toBe(true);
      release();
      result = await p;
    });
    expect(result).toBe("fatto");
    expect(h.current.busy).toBe(false);
    expect(h.current.working.current).toBe(false);
  });

  it("mentre un'operazione è in corso un'altra non parte", async () => {
    const h = renderHook(() => useExclusive(t), undefined);
    let release!: () => void;
    let second: unknown = "non eseguita";
    await act(async () => {
      const first = h.current.exclusive(() => new Promise<void>((r) => (release = r)));
      second = await h.current.exclusive(async () => "seconda");
      release();
      await first;
    });
    expect(second).toBeUndefined();
  });

  it("un errore diventa il messaggio e libera l'applicazione", async () => {
    const h = renderHook(() => useExclusive(t), undefined);
    await act(async () => {
      await h.current.exclusive(async () => {
        throw "disco pieno";
      });
    });
    expect(h.current.error).toBe("disco pieno");
    expect(h.current.busy).toBe(false);
    await act(async () => {
      await h.current.exclusive(async () => 1);
    });
    expect(h.current.error).toBeNull(); // a new operation clears the error
  });
});
