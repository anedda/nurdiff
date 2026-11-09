import { describe, expect, it } from "vitest";
import { nextSelection, pageRows, revealScrollTop } from "./selectionKeys";

describe("selectionKeys", () => {
  it("la pagina è la finestra meno una riga, almeno una", () => {
    expect(pageRows(400, 20)).toBe(19);
    expect(pageRows(30, 20)).toBe(1);
    expect(pageRows(0, 20)).toBe(1);
  });

  it("i tasti di spostamento", () => {
    expect(nextSelection("ArrowDown", 5, 10, 100)).toBe(6);
    expect(nextSelection("ArrowDown", -1, 10, 100)).toBe(0);
    expect(nextSelection("ArrowUp", 5, 10, 100)).toBe(4);
    expect(nextSelection("ArrowUp", -1, 10, 100)).toBe(0);
    expect(nextSelection("PageDown", 5, 10, 100)).toBe(15);
    expect(nextSelection("PageUp", 5, 10, 100)).toBe(-5); // whoever calls it limits it
    expect(nextSelection("Home", 50, 10, 100)).toBe(0);
    expect(nextSelection("End", 50, 10, 100)).toBe(99);
    expect(nextSelection("a", 5, 10, 100)).toBeUndefined();
    expect(nextSelection("constructor", 5, 10, 100)).toBeUndefined();
  });

  it("porta in vista una riga con il minimo spostamento", () => {
    // 400 px window starting at 1000, rows of 20 px, 16 px of horizontal bar
    expect(revealScrollTop(1000, 400, 60, 20, 16)).toBe(1000); // the row (at 1200) is already in view
    expect(revealScrollTop(1000, 400, 40, 20, 16)).toBe(800); // above: the row goes to the top
    expect(revealScrollTop(1000, 400, 70, 20, 16)).toBe(1036); // below (at 1400): it goes to the bottom, above the bar
  });
});
