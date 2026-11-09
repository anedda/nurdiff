import { describe, expect, it } from "vitest";
import { ChunkCache, chunkBounds, chunkRange } from "./chunks";

describe("chunkRange", () => {
  it("senza righe non c'è nulla da caricare", () => {
    expect(chunkRange(0, 10, 100, 0)).toBeNull();
  });

  it("restituisce i chunk che coprono l'intervallo", () => {
    expect(chunkRange(0, 50, 100, 1000)).toEqual([0, 0]);
    expect(chunkRange(0, 100, 100, 1000)).toEqual([0, 0]); // end is exclusive
    expect(chunkRange(0, 101, 100, 1000)).toEqual([0, 1]);
    expect(chunkRange(250, 420, 100, 1000)).toEqual([2, 4]);
  });

  it("limita l'intervallo al file", () => {
    expect(chunkRange(-50, 10, 100, 1000)).toEqual([0, 0]);
    expect(chunkRange(950, 5000, 100, 1000)).toEqual([9, 9]);
    expect(chunkRange(5000, 6000, 100, 1000)).toEqual([9, 9]);
  });

  it("un intervallo vuoto copre comunque il chunk della posizione", () => {
    expect(chunkRange(300, 300, 100, 1000)).toEqual([3, 3]);
  });
});

describe("chunkBounds", () => {
  it("dà gli estremi del chunk, con l'ultimo più corto", () => {
    expect(chunkBounds(0, 100, 250)).toEqual([0, 100]);
    expect(chunkBounds(1, 100, 250)).toEqual([100, 200]);
    expect(chunkBounds(2, 100, 250)).toEqual([200, 250]);
  });

  it("un chunk oltre la fine è vuoto", () => {
    expect(chunkBounds(5, 100, 250)).toEqual([250, 250]);
  });
});

describe("ChunkCache", () => {
  const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

  it("trova le righe dei chunk presenti e solo quelle", () => {
    const cache = new ChunkCache<number>(10, 5);
    cache.set(1, rows(10, 10));
    expect(cache.row(10)).toBe(10);
    expect(cache.row(19)).toBe(19);
    expect(cache.row(9)).toBeUndefined();
    expect(cache.row(20)).toBeUndefined();
    expect(cache.row(-1)).toBeUndefined();
  });

  it("l'ultimo chunk può essere più corto", () => {
    const cache = new ChunkCache<number>(10, 5);
    cache.set(2, rows(20, 3));
    expect(cache.row(22)).toBe(22);
    expect(cache.row(23)).toBeUndefined();
  });

  it("missing esclude i chunk in cache e quelli già richiesti", () => {
    const cache = new ChunkCache<number>(10, 5);
    cache.set(1, rows(10, 10));
    cache.markPending(3);
    expect(cache.missing(0, 4)).toEqual([0, 2, 4]);
  });

  it("un chunk la cui richiesta fallisce può essere richiesto di nuovo", () => {
    const cache = new ChunkCache<number>(10, 5);
    cache.markPending(0);
    expect(cache.missing(0, 0)).toEqual([]);
    cache.clearPending(0);
    expect(cache.missing(0, 0)).toEqual([0]);
  });

  it("set toglie il chunk dai richiesti", () => {
    const cache = new ChunkCache<number>(10, 5);
    cache.markPending(0);
    cache.set(0, rows(0, 10));
    expect(cache.missing(0, 0)).toEqual([]);
    expect(cache.has(0)).toBe(true);
  });

  it("oltre il limite scarta i chunk meno recenti", () => {
    const cache = new ChunkCache<number>(10, 3);
    for (let c = 0; c < 5; c++) cache.set(c, rows(c * 10, 10));
    expect(cache.size).toBe(3);
    expect([0, 1, 2, 3, 4].map((c) => cache.has(c))).toEqual([false, false, true, true, true]);
  });

  it("touch protegge i chunk in uso dallo scarto", () => {
    const cache = new ChunkCache<number>(10, 3);
    for (let c = 0; c < 3; c++) cache.set(c, rows(c * 10, 10));
    cache.touch(0, 0); // chunk 0 was the oldest
    cache.set(3, rows(30, 10)); // discards the oldest one left: 1
    expect([0, 1, 2, 3].map((c) => cache.has(c))).toEqual([true, false, true, true]);
  });

  it("touch ignora i chunk assenti", () => {
    const cache = new ChunkCache<number>(10, 3);
    cache.set(1, rows(10, 10));
    cache.touch(0, 5);
    expect(cache.size).toBe(1);
  });
});
