import { describe, expect, it } from "vitest";
import { dropSlot, moveTab } from "./tabDrag";

const t = (id: number, home = false) => ({ id, home });
const ids = (tabs: { id: number }[]) => tabs.map((x) => x.id);

describe("dropSlot", () => {
  it("conta i centri a sinistra del puntatore", () => {
    const centers = [50, 150, 250];
    expect(dropSlot(centers, 0)).toBe(0);
    expect(dropSlot(centers, 100)).toBe(1);
    expect(dropSlot(centers, 200)).toBe(2);
    expect(dropSlot(centers, 999)).toBe(3);
  });
  it("senza altri tab la posizione è la prima", () => {
    expect(dropSlot([], 300)).toBe(0);
  });
});

describe("moveTab", () => {
  const tabs = [t(0, true), t(1), t(2), t(3)];
  it("sposta un tab e tiene la Home in testa", () => {
    expect(ids(moveTab(tabs, 3, 0))).toEqual([0, 3, 1, 2]);
    expect(ids(moveTab(tabs, 1, 2))).toEqual([0, 2, 3, 1]);
    expect(ids(moveTab(tabs, 2, 1))).toEqual([0, 1, 2, 3]);
  });
  it("limita la posizione ai tab che ci sono", () => {
    expect(ids(moveTab(tabs, 1, 99))).toEqual([0, 2, 3, 1]);
    expect(ids(moveTab(tabs, 3, -5))).toEqual([0, 3, 1, 2]);
  });
  it("la Home non si sposta e un id sconosciuto non cambia nulla", () => {
    expect(moveTab(tabs, 0, 2)).toBe(tabs);
    expect(moveTab(tabs, 42, 1)).toBe(tabs);
  });
});
