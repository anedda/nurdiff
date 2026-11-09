import { describe, expect, it } from "vitest";
import { availableLanguages, catalogs, FALLBACK_LANGUAGE, resolveLanguage, translate } from "./index";

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (key: string) => key.replace(PLURAL, "");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("catalogo", () => {
  const en = catalogs[FALLBACK_LANGUAGE];
  const enBases = new Set(Object.keys(en).map(base));

  it("esistono inglese e italiano", () => {
    expect(Object.keys(catalogs)).toEqual(expect.arrayContaining(["en", "it"]));
    expect(availableLanguages().map((l) => l.code)).toEqual(expect.arrayContaining(["en", "it"]));
  });

  for (const [code, catalog] of Object.entries(catalogs)) {
    it(`${code}: ha le stesse voci dell'inglese e nessuna in più`, () => {
      const bases = new Set(Object.keys(catalog).map(base));
      expect([...enBases].filter((k) => !bases.has(k))).toEqual([]);
      expect([...bases].filter((k) => !enBases.has(k))).toEqual([]);
    });
    it(`${code}: ogni voce con plurali ha «_other» e gli stessi segnaposto dell'inglese`, () => {
      const problems: string[] = [];
      for (const key of Object.keys(catalog)) {
        if (!PLURAL.test(key)) continue;
        if (!(`${base(key)}_other` in catalog)) problems.push(`${key}: manca _other`);
      }
      for (const key of Object.keys(catalog)) {
        const b = base(key);
        const ref = en[key] ?? en[`${b}_other`] ?? en[b];
        if (ref !== undefined && placeholders(ref) !== placeholders(catalog[key])) {
          // plural forms may omit {count} (e.g. "one file"): only the others are compared
          const strip = (s: string) => placeholders(s).split(",").filter((p) => p && p !== "count").join(",");
          if (strip(ref) !== strip(catalog[key])) problems.push(`${key}: segnaposto diversi`);
        }
      }
      expect(problems).toEqual([]);
    });
    it(`${code}: nessun testo vuoto`, () => {
      expect(Object.entries(catalog).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    });
  }
});

describe("translate", () => {
  it("riempie i segnaposto", () => {
    expect(translate("en", "lang.name")).toBe("English");
    expect(translate("en", "report.saved", { path: "/x/r.html" })).toBe("Report saved to /x/r.html");
    expect(translate("it", "sb.position", { n: 2, total: 9 })).toBe("2 di 9");
  });
  it("una chiave mancante in una lingua si legge in inglese", () => {
    catalogs.zz = { "lang.name": "Zed" };
    expect(translate("zz", "common.close")).toBe("Close");
    delete catalogs.zz;
  });
  it("sceglie il plurale", () => {
    expect(translate("en", "sb.lines", { count: 1 })).toBe("1 line");
    expect(translate("en", "sb.lines", { count: 3 })).toBe("3 lines");
    expect(translate("it", "sb.lines", { count: 1 })).toBe("1 riga");
    expect(translate("it", "sb.lines", { count: 3 })).toBe("3 righe");
  });
  it("una chiave mancante si vede com'è", () => {
    expect(translate("en", "non.esiste")).toBe("non.esiste");
  });
});

describe("resolveLanguage", () => {
  it("segue una scelta valida", () => expect(resolveLanguage("it", ["en-US"])).toBe("it"));
  it("una scelta sconosciuta torna all'inglese", () => expect(resolveLanguage("xx", ["it"])).toBe("en"));
  it("auto: prima lingua del sistema con un catalogo", () => {
    expect(resolveLanguage("auto", ["fr-FR", "it-IT", "en-US"])).toBe("it");
    expect(resolveLanguage("auto", ["en-GB"])).toBe("en");
    expect(resolveLanguage("auto", ["zz"])).toBe("en");
    expect(resolveLanguage("auto", [])).toBe("en");
  });
});

describe("chiavi usate nel codice", () => {
  const en = catalogs[FALLBACK_LANGUAGE];
  const has = (key: string) => key in en || `${key}_other` in en;
  const read = (modules: Record<string, string>, skip: RegExp) =>
    Object.entries(modules).filter(([f]) => !skip.test(f));
  const noComments = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");

  it("ogni t(\"chiave\") scritta per esteso esiste nel catalogo", () => {
    const sources = import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const missing: string[] = [];
    for (const [file, raw] of read(sources, /\.test\.ts$|\/locales\//)) {
      const text = noComments(raw);
      for (const m of text.matchAll(/\bt[rt]?\(\s*"([\w.]+)"/g)) if (!has(m[1])) missing.push(`${file}: ${m[1]}`);
      for (const m of text.matchAll(/(?:labelKey|titleKey):\s*"([\w.]+)"/g)) if (!has(m[1])) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it("ogni codice d'errore di Rust ha un testo", () => {
    const sources = {
      ...(import.meta.glob("../../crates/core/src/*.rs", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
      ...(import.meta.glob("../../crates/archive/src/*.rs", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
      ...(import.meta.glob("../../src-tauri/src/main.rs", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
    };
    const missing: string[] = [];
    for (const [file, text] of read(sources, /coded\.rs$/)) {
      for (const m of text.matchAll(/CodedError::new\(\s*"([\w.]+)"/g)) if (!has(m[1])) missing.push(`${file}: ${m[1]}`);
    }
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });
});
