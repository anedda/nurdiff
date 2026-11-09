import { describe, expect, it } from "vitest";
import { renderHook } from "../test/renderHook";
import { useKeyed, useRevealRequest } from "./useKeyed";

describe("useKeyed", () => {
  it("rifà il valore solo quando cambia la chiave, non la funzione", () => {
    let made = 0;
    const h = renderHook(({ key }) => useKeyed(() => ({ n: ++made }), key), { key: "a" });
    const first = h.current;
    h.rerender({ key: "a" }); // the function is new at every render, the key is not
    expect(h.current).toBe(first);
    expect(made).toBe(1);
    h.rerender({ key: "b" });
    expect(h.current).not.toBe(first);
    expect(made).toBe(2);
  });
});

describe("useRevealRequest", () => {
  it("una richiesta nuova a ogni cambio di riga o di innesco, anche a parità di riga", () => {
    const h = renderHook(({ index, trigger }) => useRevealRequest(index, trigger), { index: 4, trigger: "x" });
    const first = h.current;
    expect(first).toEqual({ index: 4 });
    h.rerender({ index: 4, trigger: "x" });
    expect(h.current).toBe(first); // nothing new: no new request
    h.rerender({ index: 4, trigger: "y" });
    expect(h.current).not.toBe(first);
    expect(h.current).toEqual({ index: 4 });
    h.rerender({ index: 9, trigger: "y" });
    expect(h.current).toEqual({ index: 9 });
  });

  it("con un indice negativo non c'è nessuna richiesta", () => {
    const h = renderHook(({ index }) => useRevealRequest(index, 0), { index: -1 });
    expect(h.current).toBeNull();
  });
});
