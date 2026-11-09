import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The contract between the Tauri commands (`src-tauri/src/main.rs`) and the interface (`src/api.ts`) is written by hand
 * on both sides: a renamed command or argument would pass the Rust tests and the browser test (which simulates `invoke`)
 * and fail only in the real window. This test reads both files and compares them.
 */
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const rust = read("src-tauri/src/main.rs");
const api = read("src/api.ts");
const simulator = read("tools/ui-test/harness.py");

interface RustParam {
  name: string;
  optional: boolean;
}

/** Splits at the commas that are not inside `<...>` or `(...)`. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if ("<({[".includes(ch)) depth++;
    else if (">)}]".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const camel = (snake: string) => snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The commands defined in Rust with their arguments as the interface sees them (camelCase; injected ones left out). */
function rustCommands(): Map<string, RustParam[]> {
  const result = new Map<string, RustParam[]>();
  const re = /#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g;
  for (const m of rust.matchAll(re)) {
    const params = splitTop(m[2]).flatMap((p) => {
      const [name, ...type] = p.split(":");
      const t = type.join(":").trim();
      if (/^(State|AppHandle|Window|WebviewWindow|tauri::)/.test(t)) return [];
      return [{ name: camel(name.trim()), optional: t.startsWith("Option<") }];
    });
    result.set(m[1], params);
  }
  return result;
}

/** The commands registered in `generate_handler!`. */
function registered(): string[] {
  const m = /generate_handler!\s*\[([^\]]*)\]/.exec(rust);
  expect(m, "generate_handler! non trovato in main.rs").not.toBeNull();
  return splitTop(m![1]);
}

/** The commands the interface calls, with the argument names it passes. */
function invoked(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const re = /invoke(?:<.+?>)?\(\s*"(\w+)"(?:\s*,\s*\{([^}]*)\})?\s*\)/g;
  for (const m of api.matchAll(re)) {
    const keys = m[2] ? splitTop(m[2]).map((entry) => entry.split(":")[0].trim()) : [];
    result.set(m[1], keys);
  }
  return result;
}

describe("contratto tra i comandi di Tauri e api.ts", () => {
  const defined = rustCommands();
  const handler = registered();
  const calls = invoked();

  it("legge davvero i comandi (non un elenco vuoto)", () => {
    expect(defined.size).toBeGreaterThan(30);
    expect(calls.size).toBeGreaterThan(30);
    expect(defined.get("compare_files")?.map((p) => p.name)).toContain("left");
  });

  it("ogni comando definito è registrato in generate_handler!, e viceversa", () => {
    expect([...defined.keys()].sort()).toEqual([...handler].sort());
    expect(new Set(handler).size).toBe(handler.length);
  });

  it("ogni comando chiamato da api.ts esiste in Rust", () => {
    const missing = [...calls.keys()].filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });

  it("ogni comando di Rust è chiamato da api.ts", () => {
    const notCalled = [...defined.keys()].filter((name) => !calls.has(name));
    expect(notCalled).toEqual([]);
  });

  it("gli argomenti passati coincidono con i parametri di Rust (quelli Option si possono omettere)", () => {
    const problems: string[] = [];
    for (const [name, keys] of calls) {
      const params = defined.get(name);
      if (!params) continue;
      const names = params.map((p) => p.name);
      const unknown = keys.filter((k) => !names.includes(k));
      const missing = params.filter((p) => !p.optional && !keys.includes(p.name)).map((p) => p.name);
      if (unknown.length) problems.push(`${name}: argomenti che Rust non ha: ${unknown.join(", ")}`);
      if (missing.length) problems.push(`${name}: argomenti obbligatori mancanti: ${missing.join(", ")}`);
    }
    expect(problems).toEqual([]);
  });

  it("il simulatore della prova UI ha un ramo per ogni comando", () => {
    const without = [...defined.keys()].filter((name) => !simulator.includes(`'${name}'`) && !simulator.includes(`"${name}"`));
    expect(without).toEqual([]);
  });
});
