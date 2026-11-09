import { describe, expect, it } from "vitest";
import { act, renderHook } from "../test/renderHook";
import { CHUNK_SIZE } from "./chunks";
import { useRowChunks } from "./useRowChunks";

/** A fake row service: every request stays pending until the test resolves it. */
function service() {
  const calls: { id: number; from: number; to: number; resolve: () => void; fail: (e: unknown) => void }[] = [];
  const fetchRows = (id: number, from: number, to: number) =>
    new Promise<string[]>((resolve, reject) => {
      calls.push({
        id,
        from,
        to,
        resolve: () => resolve(Array.from({ length: to - from }, (_, i) => `riga ${from + i}`)),
        fail: reject,
      });
    });
  return { calls, fetchRows };
}

interface Props {
  id: number;
  revision: number;
  total: number;
  start: number;
  end: number;
}
const run = (fetchRows: ReturnType<typeof service>["fetchRows"], errors: unknown[] = []) =>
  (p: Props) => useRowChunks<string>(p.id, p.revision, p.total, fetchRows, p.start, p.end, (e) => errors.push(e));

describe("useRowChunks", () => {
  it("chiede il blocco che copre la finestra e poi restituisce le righe", async () => {
    const s = service();
    const h = renderHook(run(s.fetchRows), { id: 1, revision: 0, total: 1000, start: 0, end: 40 });
    expect(s.calls.map((c) => [c.from, c.to])).toEqual([[0, CHUNK_SIZE]]);
    expect(h.current(3)).toBeUndefined(); // not arrived yet: the view shows a placeholder
    await act(async () => s.calls[0].resolve());
    expect(h.current(3)).toBe("riga 3");
  });

  it("scorrendo chiede anche i blocchi vicini, e non ripete quelli già chiesti", async () => {
    const s = service();
    const h = renderHook(run(s.fetchRows), { id: 1, revision: 0, total: 2000, start: 0, end: 40 });
    await act(async () => s.calls[0].resolve());
    const asked = s.calls.length;
    h.rerender({ id: 1, revision: 0, total: 2000, start: 10, end: 50 }); // still in the first block
    expect(s.calls.length).toBe(asked);
    h.rerender({ id: 1, revision: 0, total: 2000, start: 700, end: 740 });
    expect(s.calls.some((c) => c.from === CHUNK_SIZE)).toBe(true);
  });

  it("con un'altra revisione le righe già ricevute si scartano e si richiedono", async () => {
    const s = service();
    const h = renderHook(run(s.fetchRows), { id: 1, revision: 0, total: 1000, start: 0, end: 40 });
    await act(async () => s.calls[0].resolve());
    expect(h.current(0)).toBe("riga 0");
    h.rerender({ id: 1, revision: 1, total: 1000, start: 0, end: 40 });
    expect(h.current(0)).toBeUndefined();
    expect(s.calls).toHaveLength(2);
  });

  it("la risposta del confronto vecchio non finisce in quello nuovo", async () => {
    const s = service();
    const h = renderHook(run(s.fetchRows), { id: 1, revision: 0, total: 1000, start: 0, end: 40 });
    h.rerender({ id: 2, revision: 0, total: 1000, start: 0, end: 40 });
    await act(async () => s.calls[0].resolve()); // it arrives late, for comparison 1
    expect(h.current(0)).toBeUndefined();
    await act(async () => s.calls[1].resolve());
    expect(h.current(0)).toBe("riga 0");
  });

  it("un errore di lettura va a onError e il blocco si può richiedere di nuovo", async () => {
    const s = service();
    const errors: unknown[] = [];
    const h = renderHook(run(s.fetchRows, errors), { id: 1, revision: 0, total: 1000, start: 0, end: 40 });
    await act(async () => s.calls[0].fail("rete"));
    expect(errors).toEqual(["rete"]);
    h.rerender({ id: 1, revision: 0, total: 1000, start: 1, end: 41 });
    expect(s.calls).toHaveLength(2); // the block is no longer "pending": it is requested
  });

  it("senza righe non chiede nulla", () => {
    const s = service();
    renderHook(run(s.fetchRows), { id: 1, revision: 0, total: 0, start: 0, end: 0 });
    expect(s.calls).toHaveLength(0);
  });
});
