import { describe, expect, it } from "vitest";
import type { MinorCauses } from "../types";
import { describeMinor } from "./minor";

const t = (key: string) => key;
const none: MinorCauses = { eol: false, encoding: false, trailingSpace: false, whitespace: false, case: false };

describe("describeMinor", () => {
  it("elenca solo le cause presenti, nell'ordine fisso, separate da virgole", () => {
    expect(describeMinor({ ...none, eol: true }, t)).toBe("minor.eol");
    expect(describeMinor({ ...none, case: true, eol: true, whitespace: true }, t)).toBe("minor.eol, minor.whitespace, minor.case");
  });

  it("senza cause il testo è vuoto", () => {
    expect(describeMinor(none, t)).toBe("");
  });
});
