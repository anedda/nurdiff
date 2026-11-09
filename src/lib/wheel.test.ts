import { describe, expect, it } from "vitest";
import { clamp, wheelDelta } from "./wheel";

const ev = (deltaX: number, deltaY: number, deltaMode = 0, shiftKey = false) => ({
  deltaX,
  deltaY,
  deltaMode,
  shiftKey,
});

describe("wheelDelta", () => {
  it("in pixel resta com'è", () => {
    expect(wheelDelta(ev(3, 120), 20, 600)).toEqual({ dx: 3, dy: 120 });
  });
  it("in righe si moltiplica per l'altezza della riga, in pagine per quella della finestra", () => {
    expect(wheelDelta(ev(0, 3, 1), 20, 600)).toEqual({ dx: 0, dy: 60 });
    expect(wheelDelta(ev(0, 1, 2), 20, 600)).toEqual({ dx: 0, dy: 600 });
  });
  it("con Maiusc la rotella verticale diventa orizzontale", () => {
    expect(wheelDelta(ev(0, 100, 0, true), 20, 600)).toEqual({ dx: 100, dy: 0 });
  });
  it("con Maiusc ma già in orizzontale non cambia nulla", () => {
    expect(wheelDelta(ev(40, 10, 0, true), 20, 600)).toEqual({ dx: 40, dy: 10 });
  });
});

describe("clamp", () => {
  it("limita ai bordi", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(5, 0, -3)).toBe(0); // content shorter than the window: the minimum wins
  });
});
