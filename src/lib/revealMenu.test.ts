import { describe, expect, it, vi } from "vitest";
import { makeT } from "../i18n";
import { revealItems } from "./revealMenu";

const it_ = makeT("it");
const en = makeT("en");

describe("revealItems", () => {
  it("la voce da entrambi i lati: una voce per lato, ciascuna con il suo percorso", () => {
    const go = vi.fn();
    const items = revealItems({ left: "/a/x.txt", right: "/b/x.txt" }, go, it_);
    expect(items.map((i) => i.label)).toEqual(["Mostra nel file manager (sinistra)", "Mostra nel file manager (destra)"]);
    expect(items.map((i) => !!i.separator)).toEqual([true, false]);
    items[0].onSelect?.();
    items[1].onSelect?.();
    expect(go.mock.calls).toEqual([["/a/x.txt"], ["/b/x.txt"]]);
  });
  it("la voce da un lato solo: una voce sola, senza il lato", () => {
    const go = vi.fn();
    const left = revealItems({ left: "/a/x.txt", right: null }, go, it_);
    expect(left.map((i) => i.label)).toEqual(["Mostra nel file manager"]);
    left[0].onSelect?.();
    const right = revealItems({ left: null, right: "/b/x.txt" }, go, it_);
    expect(right).toHaveLength(1);
    right[0].onSelect?.();
    expect(go.mock.calls).toEqual([["/a/x.txt"], ["/b/x.txt"]]);
  });
  it("da nessun lato: nessuna voce", () => {
    expect(revealItems({ left: null, right: null }, vi.fn(), it_)).toEqual([]);
  });
  it("in inglese", () => {
    expect(revealItems({ left: "/a", right: "/b" }, vi.fn(), en).map((i) => i.label)).toEqual(["Show in file manager (left)", "Show in file manager (right)"]);
    expect(revealItems({ left: "/a", right: null }, vi.fn(), en)[0].label).toBe("Show in file manager");
  });
});
