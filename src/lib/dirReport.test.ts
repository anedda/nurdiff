import { describe, expect, it } from "vitest";
import type { DirDiff, DirEntryDiff } from "../types";
import { makeT } from "../i18n";
import { csvField, dirReportCsv, dirReportHtml, reportEntries } from "./dirReport";

const e = (path: string, status: DirEntryDiff["status"], kinds: [DirEntryDiff["leftKind"], DirEntryDiff["rightKind"]] = ["file", "file"], extra: Partial<DirEntryDiff> = {}): DirEntryDiff => ({
  path, status, leftKind: kinds[0], rightKind: kinds[1], leftSize: null, rightSize: null, leftModified: null, rightModified: null, ...extra,
});

const diff: DirDiff = {
  entries: [
    e("a", "different", ["dir", "dir"]),
    e("a/x.txt", "different", ["file", "file"], { leftSize: 12, rightSize: 2048 }),
    e("a/y.txt", "identical"),
    e("solo", "leftOnly", ["dir", null]),
    e("<b>&.txt", "rightOnly", [null, "file"]),
  ],
  stats: { identical: 1, different: 1, minor: 0, leftOnly: 1, rightOnly: 1, typeMismatch: 0 },
};

describe("reportEntries", () => {
  it("omette le cartelle presenti da entrambi i lati e, di norma, le voci identiche", () => {
    expect(reportEntries(diff, false).map((x) => x.path)).toEqual(["a/x.txt", "solo", "<b>&.txt"]);
    expect(reportEntries(diff, true).map((x) => x.path)).toEqual(["a/x.txt", "a/y.txt", "solo", "<b>&.txt"]);
  });
  it("una cartella dei due lati illeggibile resta, con il motivo nello stato", () => {
    const chiusa = e("chiusa", "different", ["dir", "dir"], { error: "Permission denied" });
    const t = makeT("en");
    expect(reportEntries({ ...diff, entries: [...diff.entries, chiusa] }, false).map((x) => x.path)).toContain("chiusa");
    expect(dirReportCsv({ ...diff, entries: [chiusa] }, false, t)).toContain("Could not be read: Permission denied");
  });
});

describe("csvField", () => {
  it("racchiude tra virgolette solo quando serve", () => {
    expect(csvField("semplice")).toBe("semplice");
    expect(csvField("a;b")).toBe('"a;b"');
    expect(csvField('di "x"')).toBe('"di ""x"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

const t = makeT("it");

describe("dirReportCsv", () => {
  it("intestazione, righe e fine riga CRLF", () => {
    const csv = dirReportCsv(diff, false, t);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Percorso;Stato;Dimensione sinistra;Dimensione destra;Data sinistra;Data destra");
    expect(lines[1]).toBe("a/x.txt;diverso;12;2048;;");
    expect(lines[2]).toBe("solo/;solo a sinistra;;;;");
    expect(lines).toHaveLength(5); // header + 3 entries + empty final row
  });
});

describe("report con differenze minori", () => {
  it("il file diverso solo per cose minori lo dice, con le cause", () => {
    const minor = {
      ...diff,
      entries: [
        ...diff.entries,
        e("m.txt", "different", ["file", "file"], {
          minor: { eol: true, encoding: false, trailingSpace: true, whitespace: false, case: false },
        }),
      ],
    };
    const csv = dirReportCsv(minor, false, t);
    expect(csv).toContain("m.txt;diverso, ma solo per cose minori: fine riga, spazi a fine riga;");
    expect(csv).toContain("a/x.txt;diverso;12;2048;;");
  });
});

describe("dirReportHtml", () => {
  it("è autonomo, con il testo protetto", () => {
    const html = dirReportHtml(diff, "/a&b", "/c", false, t, "it", new Date(2026, 9, 16, 1, 20));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("/a&amp;b ↔ /c");
    expect(html).toContain("&lt;b&gt;&amp;.txt");
    expect(html).not.toContain("<b>&.txt");
    expect(html).toContain("1 diversi · 1 solo a sinistra · 1 solo a destra");
    expect(html).toContain("2026-10-16 01:20");
    expect(html).not.toContain("<script");
    expect(html).toContain('class="different"');
    expect(html).not.toContain("a/y.txt");
  });
});
