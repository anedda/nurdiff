import { describe, expect, it } from "vitest";
import { nearestHunk, stepHunk } from "./hunks";

describe("stepHunk", () => {
  it("senza blocchi resta su -1", () => {
    expect(stepHunk(-1, 0, 1)).toBe(-1);
    expect(stepHunk(-1, 0, -1)).toBe(-1);
  });

  it("dalla posizione iniziale va al primo (avanti) o all'ultimo (indietro)", () => {
    expect(stepHunk(-1, 5, 1)).toBe(0);
    expect(stepHunk(-1, 5, -1)).toBe(4);
  });

  it("scorre e fa il giro", () => {
    expect(stepHunk(0, 3, 1)).toBe(1);
    expect(stepHunk(2, 3, 1)).toBe(0);
    expect(stepHunk(1, 3, -1)).toBe(0);
    expect(stepHunk(0, 3, -1)).toBe(2);
  });

  it("con un solo blocco resta su quello", () => {
    expect(stepHunk(0, 1, 1)).toBe(0);
    expect(stepHunk(0, 1, -1)).toBe(0);
  });
});

describe("nearestHunk", () => {
  const hunks = [
    { start: 10, end: 12, kind: "changed" as const, leftAt: 0, rightAt: 0 },
    { start: 50, end: 51, kind: "leftOnly" as const, leftAt: 0, rightAt: 0 },
  ];

  it("senza blocchi non trova nulla", () => {
    expect(nearestHunk([], 5, 100)).toBe(-1);
  });

  it("una riga dentro un blocco ha distanza zero", () => {
    expect(nearestHunk(hunks, 10, 0)).toBe(0);
    expect(nearestHunk(hunks, 11, 0)).toBe(0);
    expect(nearestHunk(hunks, 50, 0)).toBe(1);
  });

  it("sceglie il più vicino entro la tolleranza", () => {
    expect(nearestHunk(hunks, 48, 5)).toBe(1); // 2 rows before the start
    expect(nearestHunk(hunks, 13, 2)).toBe(0); // 1 row after the end
    expect(nearestHunk(hunks, 30, 25)).toBe(0); // 18 from the first, 20 from the second
    expect(nearestHunk(hunks, 32, 25)).toBe(1); // 20 from the first, 18 from the second
  });

  it("oltre la tolleranza restituisce -1", () => {
    expect(nearestHunk(hunks, 30, 5)).toBe(-1);
    expect(nearestHunk(hunks, 100, 10)).toBe(-1);
    expect(nearestHunk(hunks, 14, 1.5)).toBe(-1);
  });

  it("misura la distanza dai bordi del blocco con coordinate frazionarie", () => {
    expect(nearestHunk(hunks, 11.9, 0)).toBe(0); // still inside row 11
    expect(nearestHunk(hunks, 12.4, 1)).toBe(0); // 0.4 below the bottom edge
    expect(nearestHunk(hunks, 9.5, 0.4)).toBe(-1); // 0.5 above the top edge
    expect(nearestHunk(hunks, 9.5, 0.5)).toBe(0);
  });

  it("a parità di distanza sceglie il blocco che viene prima", () => {
    expect(nearestHunk(hunks, 31, 25)).toBe(0); // 19 from the first, 19 from the second
  });
});
