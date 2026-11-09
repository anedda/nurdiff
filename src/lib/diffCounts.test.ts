import { describe, expect, it } from "vitest";
import type { DirEntryDiff } from "../types";
import { makeT } from "../i18n";
import { countKey, countOf, countSign, diffLineCount, MAX_COUNT_BYTES, needsCount } from "./diffCounts";

const entry = (over: Partial<DirEntryDiff>): DirEntryDiff => ({
  path: "a/b.txt",
  status: "different",
  leftKind: "file",
  rightKind: "file",
  leftSize: 10,
  rightSize: 12,
  leftModified: 1,
  rightModified: 2,
  ...over,
});

describe("colonna Differenze", () => {
  it("conta le righe modificate una volta sola, più quelle da un lato solo", () => {
    expect(diffLineCount({ equal: 90, changed: 3, leftOnly: 2, rightOnly: 4 })).toBe(9);
    expect(diffLineCount({ equal: 5, changed: 0, leftOnly: 0, rightOnly: 0 })).toBe(0);
  });

  it("si contano solo i file diversi presenti da entrambi i lati", () => {
    expect(needsCount(entry({}))).toBe(true);
    expect(needsCount(entry({ status: "identical" }))).toBe(false);
    expect(needsCount(entry({ status: "leftOnly", rightKind: null }))).toBe(false);
    expect(needsCount(entry({ leftKind: "dir", rightKind: "dir" }))).toBe(false);
    expect(needsCount(entry({ status: "typeMismatch", rightKind: "dir" }))).toBe(false);
  });

  it("la chiave cambia se il file cambia", () => {
    expect(countKey(entry({}))).toBe(countKey(entry({})));
    expect(countKey(entry({ rightModified: 3 }))).not.toBe(countKey(entry({})));
    expect(countKey(entry({ leftSize: 11 }))).not.toBe(countKey(entry({})));
    expect(countKey(entry({ path: "x.txt" }))).not.toBe(countKey(entry({})));
  });
});

describe("file troppo grandi e segni della cella", () => {
  it("il limite è lo stesso del core", async () => {
    const { readFileSync } = await import("node:fs");
    const core = readFileSync(new URL("../../crates/core/src/text.rs", import.meta.url), "utf-8");
    const m = core.match(/pub const MAX_TEXT_BYTES: u64 = ([\d\s*]+);/);
    expect(m).not.toBeNull();
    expect(m![1].split("*").reduce((p, x) => p * Number(x.trim()), 1)).toBe(MAX_COUNT_BYTES);
  });

  it("countOf dice «large» dalle dimensioni senza un risultato; altrimenti il risultato", () => {
    const big = entry({ leftSize: MAX_COUNT_BYTES + 1 });
    expect(countOf(big, {})).toBe("large");
    const small = entry({});
    expect(countOf(small, { [countKey(small)]: "binary" })).toBe("binary");
    expect(countOf(small, {})).toBeUndefined();
  });

  it("countSign: «…», «—» (con il limite nel suggerimento), «!»; nulla per un risultato", () => {
    const t = makeT("en");
    expect(countSign(undefined, t)).toMatchObject({ text: "…", busy: true });
    expect(countSign("binary", t)?.text).toBe("—");
    expect(countSign("large", t)?.title).toMatch(/^File larger than 16(\.0)? MB/);
    expect(countSign("error", t)?.text).toBe("!");
    expect(countSign({ equal: 1, changed: 0, leftOnly: 0, rightOnly: 0 }, t)).toBeNull();
  });
});
