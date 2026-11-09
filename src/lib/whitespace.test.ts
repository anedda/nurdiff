import { describe, expect, it } from "vitest";
import { visibleWhitespace } from "./whitespace";

describe("visibleWhitespace", () => {
  it("gli spazi diventano puntini, anche in fondo alla riga", () => {
    expect(visibleWhitespace("a b  ").text).toBe("a·b··");
  });
  it("una tabulazione diventa una freccia e arriva alla colonna successiva", () => {
    expect(visibleWhitespace("\tx")).toEqual({ text: "→   x", col: 5 });
    expect(visibleWhitespace("ab\tx").text).toBe("ab→ x");
    expect(visibleWhitespace("abcd\tx").text).toBe("abcd→   x");
  });
  it("si può continuare un pezzo di riga da una colonna", () => {
    const first = visibleWhitespace("ab");
    expect(visibleWhitespace("\tx", first.col).text).toBe("→ x");
  });
  it("il resto del testo non cambia", () => {
    expect(visibleWhitespace("è <b>ü</b>").text).toBe("è·<b>ü</b>");
    expect(visibleWhitespace("")).toEqual({ text: "", col: 0 });
  });
});
