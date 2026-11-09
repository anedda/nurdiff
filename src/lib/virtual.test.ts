import { describe, expect, it } from "vitest";
import { scrollTopForRow, visibleRange } from "./virtual";

describe("visibleRange", () => {
  it("restituisce un intervallo vuoto per un elenco vuoto", () => {
    expect(visibleRange(0, 400, 20, 0)).toEqual([0, 0]);
  });

  it("in cima mostra le righe visibili più l'overscan sotto", () => {
    // 400px / 20px = 20 visible rows, +8 of overscan
    expect(visibleRange(0, 400, 20, 1000)).toEqual([0, 28]);
  });

  it("a metà aggiunge l'overscan da entrambi i lati", () => {
    // scrollTop 2000 => row 100; window up to row 120
    expect(visibleRange(2000, 400, 20, 1000)).toEqual([92, 128]);
  });

  it("non esce dai limiti in fondo all'elenco", () => {
    expect(visibleRange(19_600, 400, 20, 1000)).toEqual([972, 1000]);
  });

  it("con uno scroll oltre la fine non produce un intervallo invertito", () => {
    const [start, end] = visibleRange(1_000_000, 400, 20, 50);
    expect(start).toBeLessThanOrEqual(end);
    expect(end).toBe(50);
  });

  it("tratta valori negativi come zero", () => {
    expect(visibleRange(-50, 400, 20, 1000)).toEqual([0, 28]);
  });

  it("elenco più corto della finestra: mostra tutto", () => {
    expect(visibleRange(0, 400, 20, 5)).toEqual([0, 5]);
  });
});

describe("scrollTopForRow", () => {
  it("porta la riga al centro", () => {
    // row 100 => 2000px; the centre of the 400px window is 190px above the row
    expect(scrollTopForRow(100, 400, 20, 1000)).toBe(1810);
  });

  it("non va sotto zero per le prime righe", () => {
    expect(scrollTopForRow(0, 400, 20, 1000)).toBe(0);
    expect(scrollTopForRow(3, 400, 20, 1000)).toBe(0);
  });

  it("non supera il massimo scroll per le ultime righe", () => {
    // content 20000px, window 400px => maximum 19600
    expect(scrollTopForRow(999, 400, 20, 1000)).toBe(19_600);
  });

  it("se il contenuto sta tutto nella finestra non scorre", () => {
    expect(scrollTopForRow(5, 400, 20, 10)).toBe(0);
  });
});
