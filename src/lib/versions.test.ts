import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf-8");

describe("versione", () => {
  it("package.json, tauri.conf.json e Cargo.toml dicono la stessa versione", () => {
    const pkg = JSON.parse(read("package.json")).version as string;
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")).version as string;
    const cargo = /\[workspace\.package\][^[]*?version\s*=\s*"([^"]+)"/.exec(read("Cargo.toml"))?.[1];
    expect(pkg).toMatch(/^\d+\.\d+\.\d+/);
    expect(tauri).toBe(pkg);
    expect(cargo).toBe(pkg);
  });
});
