import { describe, expect, it } from "vitest";
import { splitByMarks, splitWithHits } from "./segments";

const texts = (segments: { text: string }[]) => segments.map((s) => s.text);

describe("splitByMarks", () => {
  it("senza intervalli la riga resta intera", () => {
    expect(splitByMarks("ciao", undefined)).toEqual([{ text: "ciao", marked: false }]);
    expect(splitByMarks("ciao", [])).toEqual([{ text: "ciao", marked: false }]);
    expect(splitByMarks("", [])).toEqual([{ text: "", marked: false }]);
  });

  it("divide in parti normali ed evidenziate", () => {
    expect(splitByMarks("il gatto dorme", [{ start: 3, end: 8 }])).toEqual([
      { text: "il ", marked: false },
      { text: "gatto", marked: true },
      { text: " dorme", marked: false },
    ]);
  });

  it("intervalli ai bordi e più intervalli", () => {
    const segments = splitByMarks("abcdef", [
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
    expect(texts(segments)).toEqual(["ab", "cd", "ef"]);
    expect(segments.map((s) => s.marked)).toEqual([true, false, true]);
  });

  it("intervalli adiacenti restano separati ma senza parti vuote", () => {
    const segments = splitByMarks("abcd", [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(texts(segments)).toEqual(["ab", "cd"]);
  });

  it("ignora intervalli vuoti, fuori dal testo o sovrapposti", () => {
    expect(texts(splitByMarks("abc", [{ start: 1, end: 1 }]))).toEqual(["abc"]);
    expect(texts(splitByMarks("abc", [{ start: 5, end: 9 }]))).toEqual(["abc"]);
    expect(texts(splitByMarks("abc", [{ start: 1, end: 99 }]))).toEqual(["a", "bc"]);
    const overlapping = splitByMarks("abcdef", [
      { start: 1, end: 4 },
      { start: 3, end: 5 },
    ]);
    expect(texts(overlapping)).toEqual(["a", "bcd", "e", "f"]);
  });

  it("le posizioni sono unità UTF-16, come String.slice", () => {
    // 😀 takes two units: "ciao" starts at position 3.
    const segments = splitByMarks("😀 ciao", [{ start: 3, end: 7 }]);
    expect(texts(segments)).toEqual(["😀 ", "ciao"]);
  });

  it("la concatenazione ridà sempre il testo originale", () => {
    const text = "una riga di prova";
    const segments = splitByMarks(text, [
      { start: 2, end: 6 },
      { start: 10, end: 12 },
    ]);
    expect(texts(segments).join("")).toBe(text);
  });
});

describe("splitWithHits", () => {
  it("senza corrispondenze è come splitByMarks", () => {
    expect(splitWithHits("il gatto", [{ start: 3, end: 8 }], [], null)).toEqual([
      { text: "il ", marked: false, hit: null },
      { text: "gatto", marked: true, hit: null },
    ]);
  });

  it("segna le corrispondenze e distingue quella corrente", () => {
    const out = splitWithHits("a b a", undefined, [{ start: 0, end: 1 }, { start: 4, end: 5 }], 4);
    expect(out).toEqual([
      { text: "a", marked: false, hit: "hit" },
      { text: " b ", marked: false, hit: null },
      { text: "a", marked: false, hit: "current" },
    ]);
  });

  it("una corrispondenza dentro una parte diversa taglia la parte, e le due cose si sommano", () => {
    const out = splitWithHits("il gatto dorme", [{ start: 3, end: 8 }], [{ start: 5, end: 7 }], null);
    expect(out.map((s) => [s.text, s.marked, s.hit])).toEqual([
      ["il ", false, null],
      ["ga", true, null],
      ["tt", true, "hit"],
      ["o", true, null],
      [" dorme", false, null],
    ]);
  });

  it("ignora gli intervalli fuori dal testo o vuoti e non perde nulla", () => {
    const out = splitWithHits("abc", [{ start: 1, end: 1 }], [{ start: 2, end: 99 }, { start: 5, end: 6 }], null);
    expect(out.map((s) => s.text).join("")).toBe("abc");
    expect(out.find((s) => s.hit)?.text).toBe("c");
    expect(splitWithHits("", undefined, [], null)).toEqual([{ text: "", marked: false, hit: null }]);
  });

  it("con migliaia di corrispondenze su una riga resta veloce (un solo passaggio)", () => {
    const text = "e,".repeat(20_000);
    const hits = Array.from({ length: 10_000 }, (_, i) => ({ start: i * 4, end: i * 4 + 1 }));
    const marks = Array.from({ length: 5_000 }, (_, i) => ({ start: i * 8, end: i * 8 + 2 }));
    const t0 = performance.now();
    const out = splitWithHits(text, marks, hits, 4);
    expect(performance.now() - t0).toBeLessThan(250);
    expect(out.map((s) => s.text).join("")).toBe(text);
    expect(out.filter((s) => s.hit === "current")).toHaveLength(1);
    expect(out.filter((s) => s.hit !== null)).toHaveLength(10_000);
  });
});
