import { describe, expect, it } from "vitest";
import type { Row, UnifiedRow } from "../types";
import { canCopyRow, rowCopyDirection, unifiedCopyDirection } from "./rowCopy";

const cell = (n: number) => ({ number: n, text: "x", marks: [] });
const row = (kind: Row["kind"], l: boolean, r: boolean): Row => ({ kind, left: l ? cell(1) : null, right: r ? cell(1) : null }) as Row;
const open = { left: false, right: false };

describe("rowCopy", () => {
  it("la riga di sinistra va a destra e viceversa", () => {
    expect(rowCopyDirection("left")).toBe("leftToRight");
    expect(rowCopyDirection("right")).toBe("rightToLeft");
  });

  it("si copia una riga modificata, da entrambi i lati", () => {
    const r = row("changed", true, true);
    expect(canCopyRow(r, "left", open)).toBe(true);
    expect(canCopyRow(r, "right", open)).toBe(true);
  });

  it("una riga solo a sinistra si copia solo dal lato che ce l'ha", () => {
    const r = row("leftOnly", true, false);
    expect(canCopyRow(r, "left", open)).toBe(true);
    expect(canCopyRow(r, "right", open)).toBe(false);
  });

  it("le righe uguali, non arrivate o verso un lato in sola lettura non si copiano", () => {
    expect(canCopyRow(row("equal", true, true), "left", open)).toBe(false);
    expect(canCopyRow(undefined, "left", open)).toBe(false);
    const r = row("changed", true, true);
    expect(canCopyRow(r, "left", { left: false, right: true })).toBe(false);
    expect(canCopyRow(r, "right", { left: false, right: true })).toBe(true);
    expect(canCopyRow(r, "right", { left: true, right: false })).toBe(false);
  });

  it("nella vista unificata la riga tolta va a destra e quella aggiunta a sinistra", () => {
    const u = (kind: UnifiedRow["kind"]): UnifiedRow => ({ kind, text: "x", row: 3 });
    expect(unifiedCopyDirection(u("removed"), open)).toBe("leftToRight");
    expect(unifiedCopyDirection(u("added"), open)).toBe("rightToLeft");
    expect(unifiedCopyDirection(u("equal"), open)).toBeNull();
    expect(unifiedCopyDirection(undefined, open)).toBeNull();
    expect(unifiedCopyDirection(u("removed"), { left: false, right: true })).toBeNull();
    expect(unifiedCopyDirection(u("added"), { left: true, right: false })).toBeNull();
  });
});
