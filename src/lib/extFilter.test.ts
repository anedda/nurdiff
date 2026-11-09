import { describe, expect, it } from "vitest";
import { makeT } from "../i18n";
import { describeExtFilter, EMPTY_EXT_FILTER, filterFromDraft, formatExtList, isExtFilterActive, parseExtList, sameExtFilter } from "./extFilter";

describe("parseExtList", () => {
  it("pulisce, mette in minuscolo e toglie i doppioni", () => {
    expect(parseExtList(" TS, .rs;tsx  ts ..")).toEqual(["ts", "rs", "tsx"]);
    expect(parseExtList(" , ")).toEqual([]);
  });
});

describe("isExtFilterActive / sameExtFilter", () => {
  it("il filtro vuoto non è attivo", () => {
    expect(isExtFilterActive(EMPTY_EXT_FILTER)).toBe(false);
    expect(isExtFilterActive({ ...EMPTY_EXT_FILTER, excludeNone: true })).toBe(true);
    expect(isExtFilterActive({ ...EMPTY_EXT_FILTER, includeExts: ["rs"] })).toBe(true);
  });
  it("confronta tutti i campi", () => {
    const a = { ...EMPTY_EXT_FILTER, includeExts: ["rs"] };
    expect(sameExtFilter(a, { ...a })).toBe(true);
    expect(sameExtFilter(a, { ...a, includeNone: true })).toBe(false);
    expect(sameExtFilter(a, { ...a, excludeExts: ["md"] })).toBe(false);
  });
});

describe("filterFromDraft / formatExtList", () => {
  it("costruisce il filtro dai campi", () => {
    expect(filterFromDraft({ include: "RS ts", includeNone: true, exclude: ".log", excludeNone: false })).toEqual({
      includeExts: ["rs", "ts"],
      includeNone: true,
      excludeExts: ["log"],
      excludeNone: false,
    });
    expect(formatExtList(["rs", "ts"])).toBe("rs, ts");
  });
});

describe("describeExtFilter", () => {
  it("lo racconta in italiano e in inglese", () => {
    const f = { includeExts: ["rs"], includeNone: true, excludeExts: ["log"], excludeNone: false };
    expect(describeExtFilter(f, makeT("it"))).toBe("solo rs, (nessuna estensione) · senza log");
    expect(describeExtFilter(f, makeT("en"))).toBe("only rs, (no extension) · without log");
  });
});
