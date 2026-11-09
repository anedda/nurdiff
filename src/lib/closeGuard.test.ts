import { describe, expect, it } from "vitest";
import { makeT } from "../i18n";
import { discardMessage } from "./closeGuard";

const t = makeT("it");

describe("discardMessage", () => {
  it("senza modifiche non chiede nulla", () => {
    expect(discardMessage([], t)).toBeNull();
  });
  it("elenca i tab con modifiche non salvate", () => {
    expect(discardMessage(["a.txt ↔ b.txt"], t)).toBe(
      "Ci sono unioni non salvate in «a.txt ↔ b.txt»: chiudere NurDiff le scarta. Continuare?",
    );
    expect(discardMessage(["x", "y"], t)).toContain("«x», «y»");
  });
});
